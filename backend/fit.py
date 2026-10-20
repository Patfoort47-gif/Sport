from datetime import datetime
from fitparse import FitFile


def values(message):
    return {f.name: f.value for f in message}


def serial(value):
    if isinstance(value, datetime):
        return value.isoformat() + ('Z' if value.tzinfo is None else '')
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
        if record.get('enhanced_speed') is not None:
            record['speed'] = record['enhanced_speed']
        if record.get('enhanced_altitude') is not None:
            record['altitude'] = record['enhanced_altitude']
    times = [serial(s.get('start_time') or s.get('timestamp')) for s in sessions if s.get('start_time') or s.get('timestamp')]
    if not times:
        raise ValueError('Le fichier ne contient aucune date de session.')
    sports = {str(s.get('sport', 'unknown')) for s in sessions}
    disciplines = sports - {'transition'}
    sport = 'multisport' if len(disciplines) > 1 else next(iter(disciplines), 'unknown')
    duration = sum(s.get('total_timer_time', 0) or 0 for s in sessions)
    weighted_hr = [(s.get('avg_heart_rate'), s.get('total_timer_time', 0) or 0) for s in sessions if s.get('avg_heart_rate') is not None]
    hr_duration = sum(t for _, t in weighted_hr)
    summary = dict(sport_type=sport, title=' / '.join(sorted(disciplines)), start_time=min(times), duration_seconds=duration, distance_meters=sum(s.get('total_distance', 0) or 0 for s in sessions), total_elevation_gain=sum(s.get('total_ascent', 0) or 0 for s in sessions), avg_heart_rate=round(sum(h*t for h,t in weighted_hr)/hr_duration) if hr_duration else None)
    return summary, dict(sessions=sessions, records=records, laps=[values(m) for m in fit.get_messages('lap')])
