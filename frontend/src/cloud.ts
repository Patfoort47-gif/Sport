import {getSupabase} from './supabase';
import type {Activity, Detail} from './activities';
export async function cloudContext() {
  const client = getSupabase();
  if (!client) return null;
  const {data, error} = await client.auth.getSession();
  if (error) throw new Error('Session Supabase indisponible. Reconnectez-vous.');
  return data.session ? {client, owner: data.session.user.id} : null;
}
function check(error: {message: string} | null) {
  if (error) throw new Error('Supabase : opération impossible. Vérifiez la connexion et la configuration du projet.');
}
export async function cloudList(context: NonNullable<Awaited<ReturnType<typeof cloudContext>>>): Promise<Activity[]> {
  const rows: Activity[] = [];
  for (let offset=0; ; offset+=500) {
    const {data,error} = await context.client.from('sport_activities').select('summary').eq('owner_id',context.owner).order('start_time',{ascending:false}).order('id').range(offset,offset+499);
    check(error);
    rows.push(...(data ?? []).map(row => row.summary as Activity));
    if (!data || data.length < 500) return rows;
  }
}
export async function cloudDetail(context: NonNullable<Awaited<ReturnType<typeof cloudContext>>>, id: string): Promise<Detail> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Identifiant invalide.');
  const {data,error} = await context.client.storage.from('sport-files').download(`${context.owner}/${id}/detail.json`);
  check(error);
  if (!data) throw new Error('Détail indisponible.');
  return JSON.parse(await data.text());
}
export async function cloudSave(context: NonNullable<Awaited<ReturnType<typeof cloudContext>>>, activity: Detail, raw: ArrayBuffer): Promise<boolean> {
  const {client,owner} = context;
  const existing = await client.from('sport_activities').select('id').eq('owner_id',owner).eq('id',activity.id).maybeSingle();
  check(existing.error);
  if (existing.data) return false;
  const prefix = `${owner}/${activity.id}`;
  const bucket = client.storage.from('sport-files');
  const original = await bucket.upload(`${prefix}/original.fit`,raw,{contentType:'application/octet-stream',upsert:true});
  check(original.error);
  const detail = await bucket.upload(`${prefix}/detail.json`,new Blob([JSON.stringify(activity)],{type:'application/json'}),{contentType:'application/json',upsert:true});
  check(detail.error);
  const {records:_records,sessions:_sessions,laps:_laps,...summary} = activity;
  const result = await client.from('sport_activities').upsert({owner_id:owner,id:activity.id,start_time:activity.start_time,summary},{onConflict:'owner_id,id'});
  check(result.error);
  return true;
}
