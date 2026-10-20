import FitParser, {type ParsedFit} from 'fit-file-parser';
import type {Detail, Sample} from './activities';

function normalize(message: Sample): Sample {
  const result: Sample = {};
  for (const [key, value] of Object.entries(message)) {
    if (value == null || (typeof value === 'number' && !Number.isFinite(value))) continue;
    result[key] = value instanceof Date ? value.toISOString() : value;
  }
  // fit-file-parser already returns coordinates in degrees and uses the units
  // chosen below. Enhanced values take precedence on newer Garmin devices.
  if (result.enhanced_speed != null) result.speed = result.enhanced_speed;
  if (result.enhanced_altitude != null) result.altitude = result.enhanced_altitude;
  return result;
}

export async function decodeFit(raw: ArrayBuffer): Promise<Detail> {
  if (raw.byteLength > 32 * 1024 * 1024) throw new Error('Limite : 32 Mo par fichier');
  let parsed: ParsedFit;
  try {
    // Defaults are permissive: force=false and strict=true are both necessary
    // to reject bad checksums, incomplete records and trailing bytes.
    parsed = await new FitParser({
      mode: 'list', force: false, strict: true,
      speedUnit: 'm/s', lengthUnit: 'm', temperatureUnit: 'celsius',
    }).parseAsync(raw);
  } catch {
    throw new Error('Fichier FIT invalide ou corrompu (CRC).');
  }
  const sessions = (parsed.sessions ?? []).map(normalize);
  if (!sessions.length) throw new Error('Le fichier ne contient aucune session sportive.');
  const sports = [...new Set(sessions.map(s => String(s.sport ?? 'unknown')).filter(s => s !== 'transition'))];
  const times = sessions.map(s => s.start_time ?? s.timestamp).filter((v): v is string => typeof v === 'string').sort();
  if (!times.length) throw new Error('La session FIT ne contient aucune date.');
  const sum = (field: string) => sessions.reduce((total,s) => total + (typeof s[field] === 'number' ? s[field] : 0),0);
  const withHR = sessions.filter(s => typeof s.avg_heart_rate === 'number');
  const hrSeconds = withHR.reduce((n,s) => n + (s.total_timer_time ?? 0),0);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return {
    id: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,'0')).join(''),
    title: sports.join(' / '), sport_type: sports.length > 1 ? 'multisport' : sports[0] ?? 'unknown',
    start_time: times[0], duration_seconds: sum('total_timer_time'), distance_meters: sum('total_distance'),
    total_elevation_gain: sum('total_ascent'),
    avg_heart_rate: hrSeconds ? Math.round(withHR.reduce((n,s) => n + s.avg_heart_rate * (s.total_timer_time ?? 0),0) / hrSeconds) : null,
    sessions, records: (parsed.records ?? []).map(normalize), laps: (parsed.laps ?? []).map(normalize),
  };
}
