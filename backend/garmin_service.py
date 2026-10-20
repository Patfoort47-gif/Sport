"""Authenticated, single-owner Garmin login service for the GitHub Pages app."""
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date
import logging
import os
from threading import Lock
import time
from uuid import UUID, uuid4

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from garminconnect import Garmin
from pydantic import BaseModel, Field, SecretStr

from scripts.sync_garmin import Cloud, synchronize, synchronize_history_batch

# Do not emit authentication-library exceptions or request bodies into host logs.
logging.getLogger('garminconnect').addHandler(logging.NullHandler())
logging.getLogger('garminconnect').propagate = False
logging.getLogger('garminconnect.client').disabled = True

app = FastAPI(title='Sport Garmin connection', docs_url=None, redoc_url=None, openapi_url=None)
ORIGIN = 'https://patfoort47-gif.github.io'
app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], allow_methods=['GET','POST','DELETE'], allow_headers=['Authorization','Content-Type'])
operation = Lock()


@dataclass
class Challenge:
    owner: str
    api: Garmin
    lease: str
    expires: float
    attempts: int = 0


challenges: dict[str, Challenge] = {}
attempts: dict[str, deque] = defaultdict(deque)


def cloud_for(owner):
    return Cloud(os.environ.get('SUPABASE_URL','https://uelygvkvdlxrewpftyrf.supabase.co'), os.environ['SUPABASE_SERVICE_ROLE_KEY'], owner)


def verify_user(token):
    url = os.environ.get('SUPABASE_URL','https://uelygvkvdlxrewpftyrf.supabase.co')
    # Cloud validates the server-controlled project hostname too.
    key = os.environ.get('SUPABASE_PUBLISHABLE_KEY','sb_publishable_4Mhu0z03DuG8pLGOZK-msQ_Opm9_bx1')
    with httpx.Client(timeout=15) as client:
        response = client.get(url+'/auth/v1/user', headers={'apikey':key,'Authorization':'Bearer '+token})
        response.raise_for_status()
        return str(UUID(response.json()['id']))


def require_user(authorization: str = Header(default=''), origin: str = Header(default='')):
    if origin and origin != ORIGIN:
        raise HTTPException(403,'Origine refusée.')
    if not os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or not os.environ.get('SUPABASE_USER_ID'):
        raise HTTPException(503,'Service Garmin non configuré.')
    if not authorization.startswith('Bearer ') or len(authorization)>8192:
        raise HTTPException(401,'Connectez-vous à votre compte de l’application.')
    try:
        owner = verify_user(authorization[7:])
    except Exception:
        raise HTTPException(401,'Session de l’application invalide ou expirée.') from None
    if owner != os.environ['SUPABASE_USER_ID']:
        raise HTTPException(403,'Ce service personnel est réservé au compte configuré.')
    return owner


def limit(owner):
    now=time.monotonic()
    queue=attempts[owner]
    while queue and queue[0]<now-600:
        queue.popleft()
    if len(queue)>=5:
        raise HTTPException(429,'Trop de tentatives. Attendez dix minutes.')
    queue.append(now)
    for key, challenge in list(challenges.items()):
        if challenge.expires<now:
            cloud=cloud_for(challenge.owner)
            try:
                cloud.release(challenge.lease)
            except Exception:
                pass
            finally:
                cloud.http.close()
            del challenges[key]


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    # Pydantic's default response echoes inputs, potentially including passwords.
    return JSONResponse(status_code=422, content={'detail':'Vérifiez les champs du formulaire.'})


@app.middleware('http')
async def private_responses(request: Request, call_next):
    if request.headers.get('content-length','0').isdigit() and int(request.headers.get('content-length','0'))>16384:
        return JSONResponse(status_code=413,content={'detail':'Requête trop volumineuse.'})
    response=await call_next(request)
    response.headers['Cache-Control']='no-store'
    return response


class Credentials(BaseModel):
    email: str = Field(min_length=3,max_length=254)
    password: SecretStr = Field(min_length=1,max_length=1024)


class MFA(BaseModel):
    challenge_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    code: SecretStr = Field(min_length=4,max_length=12)


def persist(api, cloud):
    cloud.save_session(api.client.dumps())
    cloud.status('Garmin connecté. Prêt pour la synchronisation.')


@app.get('/health')
def health():
    return {'status':'ok'}


@app.get('/garmin/status')
def status(owner=Depends(require_user)):
    cloud=cloud_for(owner)
    try:
        return {'connected':bool(cloud.load_session())}
    except Exception:
        raise HTTPException(502,'État Garmin indisponible. Vérifiez la configuration du service.') from None
    finally:
        cloud.http.close()


@app.post('/garmin/connect')
def connect(body: Credentials, owner=Depends(require_user)):
    if not operation.acquire(blocking=False):
        raise HTTPException(409,'Une opération Garmin est en cours.')
    cloud=None
    lease=None
    keep_lease=False
    try:
        limit(owner)
        cloud=cloud_for(owner)
        candidate=str(uuid4())
        if not cloud.acquire(candidate,600):
            raise HTTPException(409,'Une connexion ou synchronisation Garmin est en cours. Terminez-la ou réessayez plus tard.')
        lease=candidate
        api=Garmin()
        needs_mfa,_=api.client.login(body.email,body.password.get_secret_value(),return_on_mfa=True)
        if needs_mfa:
            identity=uuid4().hex
            challenges[identity]=Challenge(owner,api,lease,time.monotonic()+300)
            keep_lease=True
            return {'status':'mfa_required','challenge_id':identity}
        persist(api,cloud)
        return {'status':'connected'}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502,'Connexion Garmin impossible. Vérifiez vos identifiants ou réessayez ultérieurement.') from None
    finally:
        if cloud:
            if lease and not keep_lease:
                try: cloud.release(lease)
                except Exception: pass
            cloud.http.close()
        operation.release()


@app.post('/garmin/mfa')
def mfa(body: MFA, owner=Depends(require_user)):
    if not operation.acquire(blocking=False):
        raise HTTPException(409,'Une opération Garmin est en cours.')
    cloud=None
    challenge=None
    try:
        limit(owner)
        challenge=challenges.get(body.challenge_id)
        if not challenge or challenge.expires<time.monotonic():
            raise HTTPException(410,'La demande a expiré. Recommencez la connexion Garmin.')
        if challenge.owner!=owner:
            raise HTTPException(403,'Demande Garmin inaccessible.')
        challenge.attempts+=1
        cloud=cloud_for(owner)
        challenge.api.client.resume_login(None,body.code.get_secret_value())
        persist(challenge.api,cloud)
        challenges.pop(body.challenge_id,None)
        cloud.release(challenge.lease)
        return {'status':'connected'}
    except HTTPException:
        raise
    except Exception:
        if challenge and challenge.attempts>=3:
            challenges.pop(body.challenge_id,None)
            if cloud:
                try: cloud.release(challenge.lease)
                except Exception: pass
        raise HTTPException(502,'Code Garmin invalide, expiré ou service indisponible. Réessayez ou recommencez la connexion.') from None
    finally:
        if cloud: cloud.http.close()
        operation.release()


@app.delete('/garmin/challenge/{identity}')
def cancel(identity: str, owner=Depends(require_user)):
    with operation:
        challenge=challenges.get(identity)
        if challenge and challenge.owner==owner:
            cloud=cloud_for(owner)
            try:
                cloud.release(challenge.lease)
                challenges.pop(identity,None)
            finally: cloud.http.close()
    return {'status':'cancelled'}


def run_sync(cloud,lease):
    try:
        api=Garmin()
        session=cloud.load_session()
        if not session: raise ValueError('missing session')
        api.login(session)
        synchronize(api,cloud,max_activities=20)
    except Exception:
        try: cloud.status('Synchronisation impossible. Réessayez ou reconnectez Garmin.')
        except Exception: pass
    finally:
        try: cloud.release(lease)
        except Exception: pass
        cloud.http.close()


@app.post('/garmin/sync',status_code=202)
def sync(background: BackgroundTasks, owner=Depends(require_user)):
    cloud=cloud_for(owner)
    lease=str(uuid4())
    try:
        if not cloud.acquire(lease):
            raise HTTPException(409,'Une opération Garmin est déjà en cours.')
        if not cloud.load_session():
            cloud.release(lease)
            raise HTTPException(409,'Connectez Garmin avant de synchroniser.')
        cloud.status('Synchronisation demandée depuis l’application.')
        background.add_task(run_sync,cloud,lease)
        return {'status':'scheduled'}
    except HTTPException:
        cloud.http.close()
        raise
    except Exception:
        try: cloud.release(lease)
        except Exception: pass
        cloud.http.close()
        raise HTTPException(502,'Synchronisation indisponible.') from None


class HistoryRequest(BaseModel):
    since: date = date(2018, 1, 1)
    offset: int = Field(default=0, ge=0, le=1000000)


@app.post('/garmin/history')
def history(request: HistoryRequest, owner=Depends(require_user)):
    if request.since < date(1990, 1, 1) or request.since > date.today():
        raise HTTPException(422, 'Choisissez une date de début passée, à partir de 1990.')
    cloud = cloud_for(owner)
    lease = str(uuid4())
    acquired = False
    api = None
    try:
        acquired = cloud.acquire(lease)
        if not acquired:
            raise HTTPException(409, 'Une opération Garmin est déjà en cours. Réessayez après sa fin.')
        session = cloud.load_session()
        if not session:
            raise HTTPException(409, 'Connectez Garmin avant de récupérer votre historique.')
        api = Garmin()
        api.login(session)
        return synchronize_history_batch(api, cloud, request.since, request.offset)
    except HTTPException:
        raise
    except Exception:
        try: cloud.status('Import historique interrompu. Relancez-le pour reprendre sans doublons ; reconnectez Garmin si nécessaire.')
        except Exception: pass
        raise HTTPException(502, 'Import interrompu. Relancez la récupération : les activités déjà enregistrées seront conservées.') from None
    finally:
        if api:
            try: cloud.save_session(api.client.dumps())
            except Exception: pass
        if acquired:
            try: cloud.release(lease)
            except Exception: pass
        cloud.http.close()
