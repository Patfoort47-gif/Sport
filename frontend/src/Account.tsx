import {useEffect,useState,type ReactNode} from 'react';
import type {User} from '@supabase/supabase-js';
import {configurePublicKey,getSupabase} from './supabase';
import {migrateLocalActivities} from './activities';
export function Account({children}:{children:(user:User|null,revision:number)=>ReactNode}) {
  const [configured,setConfigured]=useState(()=>!!getSupabase());
  const [ready,setReady]=useState(!configured);
  const [user,setUser]=useState<User|null>(null),[revision,setRevision]=useState(0);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[key,setKey]=useState('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[sync,setSync]=useState('');
  useEffect(()=>{
    const client=getSupabase();if(!client){setReady(true);return}
    let active=true;
    client.auth.getSession().then(({data,error})=>{if(active){setUser(data.session?.user??null);setReady(true);if(error)setMessage('Session indisponible. Reconnectez-vous.')}});
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(active){setUser(session?.user??null);setReady(true);setSync('')}});
    return()=>{active=false;subscription.unsubscribe()};
  },[configured]);
  useEffect(()=>{
    const client=getSupabase();if(!user||!client)return;
    let active=true;
    client.from('sport_sync_status').select('last_success,message').eq('owner_id',user.id).maybeSingle().then(({data,error})=>{
      if(!active)return;
      setSync(error?'État Garmin indisponible : vérifiez la configuration Supabase.':data?.last_success?`Dernière synchronisation Garmin : ${new Date(data.last_success).toLocaleString('fr-FR')}. ${data.message??''}`:data?.message||'Garmin non synchronisé : terminez la configuration décrite dans le guide.');
    });
    return()=>{active=false};
  },[user?.id,revision]);
  async function authenticate(signup:boolean){
    const client=getSupabase();if(!client)return;setBusy(true);setMessage('');
    try{
      const result=signup?await client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+import.meta.env.BASE_URL}}):await client.auth.signInWithPassword({email,password});
      if(result.error)throw Error(signup?'Création du compte impossible. Vérifiez votre adresse et les réglages Supabase.':'Connexion impossible. Vérifiez vos identifiants et la confirmation de votre adresse e-mail.');
      setPassword('');if(signup&&!result.data.session)setMessage('Consultez votre e-mail pour confirmer le compte, puis connectez-vous.');
    }catch(e){setMessage(e instanceof Error?e.message:'Connexion impossible')}finally{setBusy(false)}
  }
  async function migrate(){setBusy(true);try{const count=await migrateLocalActivities();setMessage(`${count} activité(s) transférée(s) dans votre compte. Les copies locales sont conservées.`);setRevision(n=>n+1)}catch{setMessage('Transfert interrompu. Les copies locales sont conservées ; vous pouvez réessayer sans créer de doublon.')}finally{setBusy(false)}}
  return <><section className="account-panel" aria-label="Compte et synchronisation"><h2>Mon compte · PC et téléphone</h2>{!configured?<><p>Reliez ce navigateur à votre projet Supabase pour retrouver vos activités sur tous vos appareils.</p><form onSubmit={e=>{e.preventDefault();try{configurePublicKey(key);setReady(false);setConfigured(true);setKey('');setMessage('')}catch(e){setMessage(String(e))}}}><label>Clé publique Supabase (publishable ou anon)<input required value={key} onChange={e=>setKey(e.target.value)} autoComplete="off"/></label><button>Configurer Supabase</button></form><small>Projet : uelygvkvdlxrewpftyrf · Ne saisissez jamais de clé secret ou service_role.</small></>:!ready?<p>Vérification de la connexion…</p>:user?<><p>Connecté : <b>{user.email}</b>. Vos imports sont enregistrés dans votre compte Supabase.</p><div className="account-actions"><button disabled={busy} onClick={()=>setRevision(n=>n+1)}>Actualiser mes activités</button><button disabled={busy} onClick={migrate}>Transférer mes activités locales vers mon compte</button><button disabled={busy} onClick={async()=>{setBusy(true);const result=await getSupabase()!.auth.signOut();setBusy(false);setMessage(result.error?'Déconnexion impossible. Réessayez.':'')}}>Se déconnecter</button></div><p>{sync}</p></>:<><p>Connectez-vous au même compte sur vos deux appareils. Ce compte est celui de l’application, distinct de votre compte Garmin.</p><form onSubmit={e=>{e.preventDefault();authenticate(false)}}><label>E-mail<input type="email" autoComplete="username" value={email} required onChange={e=>setEmail(e.target.value)}/></label><label>Mot de passe<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Se connecter</button><button type="button" disabled={busy||!email||password.length<8} onClick={()=>authenticate(true)}>Créer mon compte</button></form></>}{message&&<p role="status">{message}</p>}<p><a href="https://github.com/Patfoort47-gif/Sport/blob/main/docs/supabase-garmin.md" target="_blank" rel="noreferrer">Guide : activer Supabase et la récupération Garmin automatique</a></p></section>{ready&&children(user,revision)}</>;
}
