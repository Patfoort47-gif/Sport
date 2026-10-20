import {openDB, type DBSchema} from 'idb';

export type Activity = {
  id: string; title: string; sport_type: string; start_time: string;
  duration_seconds: number; distance_meters: number;
  total_elevation_gain: number; avg_heart_rate: number | null;
};
export type Sample = Record<string, any>;
export type Detail = Activity & {records: Sample[]; sessions: Sample[]; laps: Sample[]};
interface Library extends DBSchema {
  activities: {key: string; value: Activity};
  details: {key: string; value: Detail};
  files: {key: string; value: ArrayBuffer};
}
const database = () => openDB<Library>('triathlon-local', 1, {
  upgrade(db) {
    db.createObjectStore('activities', {keyPath: 'id'});
    db.createObjectStore('details', {keyPath: 'id'});
    db.createObjectStore('files');
  },
});
export async function listActivities(): Promise<Activity[]> {
  const db = await database();
  try {
    return (await db.getAll('activities')).sort((a,b)=>b.start_time.localeCompare(a.start_time));
  } finally {db.close()}
}
export async function getActivity(id: string): Promise<Detail> {
  const db = await database();
  try {
    const activity = await db.get('details', id);
    if (!activity) throw new Error('Activité introuvable dans ce navigateur.');
    return activity;
  } finally {db.close()}
}
export async function saveActivity(activity: Detail, raw: ArrayBuffer): Promise<boolean> {
  const db = await database();
  try {
    const tx = db.transaction(['activities', 'details', 'files'], 'readwrite');
    const summaries = tx.objectStore('activities');
    if (await summaries.get(activity.id)) {await tx.done; return false}
    const {records: _records, sessions: _sessions, laps: _laps, ...summary} = activity;
    await summaries.add(summary);
    await tx.objectStore('details').add(activity);
    await tx.objectStore('files').add(raw, activity.id);
    await tx.done;
    return true;
  } finally {db.close()}
}
export type ImportResult = {file: string; status?: 'imported' | 'duplicate'; error?: string};
export async function importFiles(files: Iterable<File>): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  for (const file of files) {
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error('Limite : 32 Mo par fichier');
      const raw = await file.arrayBuffer();
      const {decodeFit} = await import('./fit');
      const activity = await decodeFit(raw);
      const inserted = await saveActivity(activity, raw);
      results.push({file: file.name, status: inserted ? 'imported' : 'duplicate'});
    } catch (error) {
      const storageError = error instanceof DOMException && ['QuotaExceededError', 'UnknownError', 'SecurityError', 'InvalidStateError'].includes(error.name);
      results.push({file: file.name, error: storageError ? 'Stockage du navigateur indisponible ou plein. Sauvegardez vos fichiers FIT.' : error instanceof Error ? error.message : 'Import impossible'});
    }
  }
  return results;
}
