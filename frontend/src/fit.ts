import {Decoder, Stream} from '@garmin/fitsdk';
import type {Detail, Sample} from './activities';

// Keep the UI's existing field names while using Garmin's camelCase SDK.
function normalize(message: Sample): Sample {
  const result: Sample = {};
  for (const [name, value] of Object.entries(message)) {
    const key = name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
    result[key] = value instanceof Date ? value.toISOString() : value;
  }
  for (const key of ['position_lat', 'position_long']) {
    if (typeof result[key] === 'number') result[key] *= 180 / 2 ** 31;
  }
  if (result.enhanced_speed != null) result.speed = result.enhanced_speed;
  if (result.enhanced_altitude != null) result.altitude = result.enhanced_altitude;
  return result;
}
export async function decodeFit(raw: ArrayBuffer): Promise<Detail> {
  if (raw.byteLength > 32 * 1024 * 1024) throw new Error('Limite : 32 Mo par fichier');
  const decoder = new Decoder(Stream.fromArrayBuffer(raw));
  if (!decoder.isFIT() || !decoder.checkIntegrity()) throw new Error('Fichier FIT invalide ou corrompu (CRC).');
  const {messages, errors} = decoder.read();
  if (errors.length) throw new Error('Impossible de décoder ce fichier FIT.');
  const sessions = (messages.sessionMesgs ?? []).map(normalize);
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
    sessions, records: (messages.recordMesgs ?? []).map(normalize), laps: (messages.lapMesgs ?? []).map(normalize),
  };
}
