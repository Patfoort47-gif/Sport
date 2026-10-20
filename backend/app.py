from datetime import datetime
from pathlib import Path
import hashlib
import json
import os
import sqlite3

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from fitparse import FitFile

DATA = Path(os.environ.get('TRIATHLON_DATA_DIR', Path.home() / '.triathlon_app'))
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'fits').mkdir(exist_ok=True)
app = FastAPI(title='Triathlon local')


def connect():
    db = sqlite3.connect(DATA / 'activities.sqlite')
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, summary TEXT NOT NULL, detail TEXT NOT NULL)')
    return db


def values(message):
    return {f.name: f.value for f in message}


def serial(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def parse_fit(raw):
    fit = FitFile(raw, check_crc=True)
    fit.parse()
    sessions = [values(m) for m in fit.get_messages('session')]
    if not sessions:
        raise ValueError('Le fichier ne contient aucune session sportive.')
    records = [values(m) for m in fit.get_messages('record')]
    for record in records:
        for key in ('position_lat', 'position_long'):
            if record.get(key) is not None:
                record[key] = record[key] * 180 / 2**31
    sports = {str(s.get('sport', 'unknown')) for s in sessions}
    disciplines = sports - {'transition'}
    sport = 'multisport' if len(disciplines) > 1 else next(iter(disciplines), 'unknown')
    duration = sum(s.get('total_timer_time', 0) or 0 for s in sessions)
    weighted_hr = [(s.get('avg_heart_rate'), s.get('total_timer_time', 0) or 0) for s in sessions if s.get('avg_heart_rate') is not None]
    hr_duration = sum(t for _, t in weighted_hr)
    summary = dict(sport_type=sport, title=' / '.join(sorted(disciplines)), start_time=min(str(s.get('start_time', '')) for s in sessions), duration_seconds=duration, distance_meters=sum(s.get('total_distance', 0) or 0 for s in sessions), total_elevation_gain=sum(s.get('total_ascent', 0) or 0 for s in sessions), avg_heart_rate=round(sum(h*t for h,t in weighted_hr)/hr_duration) if hr_duration else None)
    return summary, dict(sessions=sessions, records=records, laps=[values(m) for m in fit.get_messages('lap')])


@app.get('/api/health')
def health():
    with connect() as db:
        db.execute('SELECT count(*) FROM activities').fetchone()
    return {'status': 'ok'}


@app.get('/api/activities')
def activities(sport: str | None = None, start: str | None = None, end: str | None = None):
    with connect() as db:
        result = [json.loads(r['summary']) for r in db.execute('SELECT summary FROM activities')]
    return sorted([a for a in result if (not sport or a['sport_type'] == sport) and (not start or a['start_time'][:10] >= start) and (not end or a['start_time'][:10] <= end)], key=lambda a: a['start_time'], reverse=True)


@app.get('/api/activities/{activity_id}')
def detail(activity_id: str):
    with connect() as db:
        row = db.execute('SELECT summary, detail FROM activities WHERE id=?', (activity_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Activité introuvable')
    return {**json.loads(row['summary']), **json.loads(row['detail'])}


@app.post('/api/import')
async def import_files(files: list[UploadFile] = File(...)):
    results = []
    for file in files:
        raw = await file.read(32 * 1024 * 1024 + 1)
        if len(raw) > 32 * 1024 * 1024:
            results.append({'file': file.filename, 'error': 'Limite : 32 Mo par fichier'})
            continue
        identity = hashlib.sha256(raw).hexdigest()
        with connect() as db:
            if db.execute('SELECT id FROM activities WHERE id=?', (identity,)).fetchone():
                results.append({'file': file.filename, 'status': 'duplicate', 'id': identity})
                continue
        try:
            summary, data = parse_fit(raw)
        except Exception:
            results.append({'file': file.filename, 'error': 'Fichier FIT invalide, corrompu ou sans session'})
            continue
        summary['id'] = identity
        (DATA / 'fits' / f'{identity}.fit').write_bytes(raw)
        with connect() as db:
            db.execute('INSERT OR IGNORE INTO activities VALUES (?, ?, ?)', (identity, json.dumps(summary, default=serial), json.dumps(data, default=serial)))
        results.append({'file': file.filename, 'status': 'imported', 'id': identity})
    return results


BUILD = Path(__file__).resolve().parents[1] / 'frontend' / 'dist'
if BUILD.exists():
    app.mount('/', StaticFiles(directory=BUILD, html=True), name='frontend')
