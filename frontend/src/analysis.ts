import type {Detail, Sample} from './activities';

export type Metric = 'heart_rate' | 'pace' | 'altitude' | 'power' | 'cadence';
export type AnalysisPoint = {
  elapsed: number;
  timestamp: string;
  heart_rate: number | null;
  pace: number | null;
  altitude: number | null;
  power: number | null;
  cadence: number | null;
};
export const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function paceFromSpeed(speed: unknown, swimming = false): number | null {
  const metresPerSecond = finiteNumber(speed);
  return metresPerSecond !== null && metresPerSecond > 0
    ? (swimming ? 100 : 1000) / metresPerSecond / 60
    : null;
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

export function formatPace(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function analysisPoints(activity: Pick<Detail, 'records' | 'start_time' | 'sport_type'>): AnalysisPoint[] {
  const timed = activity.records.map(record => ({
    record,
    time: typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN,
  })).filter(({time}) => Number.isFinite(time)).sort((a, b) => a.time - b.time);
  if (!timed.length) return [];
  const start = Date.parse(activity.start_time);
  const origin = Number.isFinite(start) ? Math.min(start, timed[0].time) : timed[0].time;
  return timed.map(({record, time}) => {
    const hr = finiteNumber(record.heart_rate);
    const power = finiteNumber(record.power);
    const cadence = finiteNumber(record.cadence);
    return {
      elapsed: (time - origin) / 1000,
      timestamp: new Date(time).toISOString(),
      heart_rate: hr !== null && hr > 0 ? hr : null,
      pace: paceFromSpeed(record.enhanced_speed ?? record.speed, activity.sport_type === 'swimming'),
      altitude: finiteNumber(record.enhanced_altitude ?? record.altitude),
      power: power !== null && power >= 0 ? power : null,
      cadence: cadence !== null && cadence >= 0 ? cadence : null,
    };
  });
}

export function nearestPoint(points: AnalysisPoint[], elapsed: number): number | null {
  if (!points.length || !Number.isFinite(elapsed)) return null;
  let lower = 0;
  let upper = points.length - 1;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (points[middle].elapsed < elapsed) lower = middle + 1;
    else upper = middle;
  }
  if (lower > 0 && elapsed - points[lower - 1].elapsed <= points[lower].elapsed - elapsed) return lower - 1;
  return lower;
}

export function gpsSegments(records: Sample[]): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const record of records) {
    const latitude = finiteNumber(record.position_lat);
    const longitude = finiteNumber(record.position_long);
    if (latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      current.push([latitude, longitude]);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}
