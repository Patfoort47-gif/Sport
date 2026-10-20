import {createClient, type SupabaseClient} from '@supabase/supabase-js';
const projectUrl = 'https://uelygvkvdlxrewpftyrf.supabase.co';
let client: SupabaseClient | null = null;
export function isPublicKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return key.length > 20;
  try {
    const payload = key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(payload)).role === 'anon';
  } catch {return false}
}
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (typeof localStorage !== 'undefined' ? localStorage.getItem('sport-supabase-public-key') : null) || 'sb_publishable_4Mhu0z03DuG8pLGOZK-msQ_Opm9_bx1';
  if (!key || !isPublicKey(key)) return null;
  client = createClient(projectUrl, key, {auth:{storageKey:'sport-supabase-auth',persistSession:true,autoRefreshToken:true}});
  return client;
}
export function configurePublicKey(key: string) {
  if (!isPublicKey(key.trim())) throw new Error('Utilisez uniquement la clé publique publishable ou anon. Jamais secret ou service_role.');
  localStorage.setItem('sport-supabase-public-key', key.trim());
  client = null;
}
