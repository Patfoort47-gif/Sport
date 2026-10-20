"""Personal Garmin → Supabase sync. Service credentials stay outside the browser."""
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import logging
import os
import re
import sys
import time
from uuid import UUID, uuid4
from zipfile import ZipFile, is_zipfile

import httpx
from garminconnect import Garmin
from backend.fit import parse_fit, serial

MAX_FILE = 32 * 1024 * 1024


class Cloud:
    def __init__(self, url, secret, owner, client=None):
        if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co', url):
            raise ValueError('URL Supabase invalide')
        self.owner = str(UUID(owner))
        self.http = client or httpx.Client(base_url=url, headers={'apikey': secret, 'Authorization': f'Bearer {secret}'}, timeout=60)

    def request(self, method, path, **kwargs):
        response = self.http.request(method, path, **kwargs)
        response.raise_for_status()
        return response

    def acquire(self, lease, seconds=2700):
        return self.request('POST', '/rest/v1/rpc/sport_acquire_garmin_lease', json={'p_owner_id': self.owner, 'p_lease_id': lease, 'p_seconds': seconds}).json() is True

    def release(self, lease):
        self.request('POST', '/rest/v1/rpc/sport_release_garmin_lease', json={'p_owner_id': self.owner, 'p_lease_id': lease})

    def load_session(self):
        return self.request('POST', '/rest/v1/rpc/sport_load_garmin_session', json={'p_owner_id': self.owner}).json()

    def save_session(self, session):
        self.request('POST', '/rest/v1/rpc/sport_save_garmin_session', json={'p_owner_id': self.owner, 'p_session': session})

    def imported(self, identity):
        return bool(self.request('GET', '/rest/v1/sport_garmin_imports', params={'owner_id': f'eq.{self.owner}', 'garmin_id': f'eq.{identity}', 'select': 'garmin_id'}).json())

    def mark_imported(self, identity):
        self.request('POST', '/rest/v1/sport_garmin_imports', headers={'Prefer': 'resolution=merge-duplicates'}, json={'owner_id': self.owner, 'garmin_id': identity})

    def status(self, message, success=False):
        now = datetime.now(timezone.utc).isoformat()
        row = {'owner_id': self.owner, 'last_attempt': now, 'message': message}
        if success:
            row['last_success'] = now
        self.request('POST', '/rest/v1/sport_sync_status', headers={'Prefer': 'resolution=merge-duplicates'}, json=row)

    def upload(self, raw, title=None):
        summary, data = parse_fit(raw)
        identity = hashlib.sha256(raw).hexdigest()
        summary['id'] = identity
        if title:
            summary['title'] = str(title)[:300]
        detail = {**summary, **data}
        prefix = f'/storage/v1/object/sport-files/{self.owner}/{identity}'
        self.request('POST', prefix + '/original.fit', content=raw, headers={'Content-Type': 'application/octet-stream', 'x-upsert': 'true'})
        self.request('POST', prefix + '/detail.json', content=json.dumps(detail, default=serial).encode(), headers={'Content-Type': 'application/json', 'x-upsert': 'true'})
        row = {'owner_id': self.owner, 'id': identity, 'start_time': summary['start_time'], 'summary': summary}
        self.request('POST', '/rest/v1/sport_activities', headers={'Prefer': 'resolution=merge-duplicates'}, json=json.loads(json.dumps(row, default=serial)))


def fit_files(payload):
    if len(payload) > MAX_FILE:
        raise ValueError('Archive Garmin trop volumineuse')
    if is_zipfile(BytesIO(payload)):
        with ZipFile(BytesIO(payload)) as archive:
            members = [f for f in archive.infolist() if not f.is_dir() and f.filename.lower().endswith('.fit')]
            if not members or len(members) > 100 or sum(f.file_size for f in members) > MAX_FILE:
                raise ValueError('Archive FIT invalide ou trop volumineuse')
            # Read in memory: never extract paths supplied by the archive.
            return [archive.read(f) for f in members]
    if len(payload) < 12 or payload[8:12] != b'.FIT':
        raise ValueError('Réponse Garmin sans fichier FIT')
    return [payload]


def synchronize(api, cloud, max_activities=200, pause=time.sleep):
    """Scan newest activities first; mark only after all FITs have been stored."""
    imported = 0
    scanned = 0
    try:
        cloud.status('Synchronisation Garmin en cours.')
        for offset in range(0, max_activities, 50):
            batch = api.get_activities(offset, min(50, max_activities - offset))
            if not isinstance(batch, list):
                raise ValueError('Liste Garmin inattendue')
            if not batch:
                break
            for activity in batch:
                scanned += 1
                identity = str(activity['activityId'])
                if not identity.isdigit():
                    raise ValueError('Identifiant Garmin invalide')
                if cloud.imported(identity):
                    continue
                payload = api.download_activity(identity, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
                for raw in fit_files(payload):
                    cloud.upload(raw, activity.get('activityName'))
                cloud.mark_imported(identity)
                imported += 1
                pause(1)
            if len(batch) < min(50, max_activities - offset):
                break
        cloud.status(f'{imported} activité(s) récupérée(s), {scanned} activité(s) récentes vérifiée(s).', success=True)
        return imported
    except Exception:
        # Do not persist exception strings: HTTP errors can contain sensitive details.
        cloud.status('Échec Garmin/Supabase. Consultez le workflow et reconnectez Garmin si sa session a expiré.')
        raise
    finally:
        cloud.save_session(api.client.dumps())


def main():
    logging.disable(logging.CRITICAL)
    cloud = None
    lease = None
    try:
        cloud = Cloud(os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_SERVICE_ROLE_KEY'], os.environ['SUPABASE_USER_ID'])
        candidate = str(uuid4())
        if not cloud.acquire(candidate):
            print('Une connexion ou synchronisation Garmin est déjà en cours ; prochaine tentative au prochain passage.')
            return 0
        lease = candidate
        # Use the bootstrap secret when explicitly reconnecting an expired session.
        bootstrap = os.environ.get('GARMIN_SESSION', '')
        session = bootstrap if os.environ.get('RESET_GARMIN_SESSION') == 'true' else cloud.load_session() or bootstrap
        if not session:
            raise ValueError('Session Garmin manquante')
        api = Garmin()
        api.login(session)
        limit = int(os.environ.get('GARMIN_MAX_ACTIVITIES', '200'))
        if not 1 <= limit <= 5000:
            raise ValueError('Limite invalide')
        count = synchronize(api, cloud, limit)
        print(f'Synchronisation terminée : {count} nouvelle(s) activité(s).')
        return 0
    except Exception:
        if cloud:
            try:
                cloud.status('Synchronisation impossible. Vérifiez les secrets, la migration SQL et la session Garmin/MFA.')
            except Exception:
                pass
        print('Synchronisation impossible. Vérifiez la configuration Supabase et la validité de la session Garmin ; aucun secret affiché.', file=sys.stderr)
        return 1
    finally:
        if cloud:
            if lease:
                try:
                    cloud.release(lease)
                except Exception:
                    pass
            cloud.http.close()


if __name__ == '__main__':
    raise SystemExit(main())
