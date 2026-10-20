import {useEffect,useState,useRef} from 'react';
import {getSupabase} from './supabase';
export function GarminConnection({onRefresh}:{onRefresh:()=>void}){
  const [since,setSince]=useState('2018-01-01'),[historyRunning,setHistoryRunning]=useState(false);
  const stopHistory=useRef(false);
  useEffect(()=>()=>{stopHistory.current=true},[]);
  const [url,setUrl]=useState(''),[loaded,setLoaded]=useState(false),[connected,setConnected]=useState(false);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function call(path:string,body?:unknown,method=body?'POST':'GET',target=url){
    const {data,error}=await getSupabase()!.auth.getSession();
    if(error||!data.session)throw Error('Reconnectez-vous à votre compte de l’application.');
    let response:Response;
    try{
      response=await fetch(target+path,{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000),cache:'no-store'});
    }catch{throw Error('Service Garmin injoignable. Il peut être en cours de démarrage ; réessayez dans une minute.')}
    if(response.status===404&&path==='/garmin/history')throw Error('Mettez à jour le service Garmin sur Render : Manual Deploy → Deploy latest commit. Puis relancez cet import.');
    const result=await response.json();
    if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Opération Garmin impossible.');
    return result;
  }
  useEffect(()=>{
    let active=true;
    fetch(import.meta.env.BASE_URL+'garmin-service.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(async config=>{
      if(!active)return;
      if(config.url){
        const parsed=new URL(config.url);
        if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error();
        const target=parsed.origin;setUrl(target);
        try{const result=await call('/garmin/status',undefined,'GET',target);if(active)setConnected(!!result.connected)}catch(e){if(active)setMessage(e instanceof Error?e.message:'État Garmin indisponible.')}
      }
    }).catch(()=>{if(active)setMessage('Configuration du service Garmin indisponible.')}).finally(()=>{if(active)setLoaded(true)});
    return()=>{active=false};
  },[]);
  async function importHistory(){
    stopHistory.current=false;setHistoryRunning(true);setBusy(true);
    let offset=0,total=0;
    try{
      while(!stopHistory.current){
        setMessage(`Récupération depuis ${since} : ${offset} entrées parcourues, ${total} nouvelles activités. Gardez cette page ouverte.`);
        const result=await call('/garmin/history',{since,offset});
        if(typeof result.next_offset!=='number'||typeof result.done!=='boolean'||typeof result.imported!=='number'||(!result.done&&result.next_offset<=offset))throw Error('Réponse du service historique invalide. Mettez à jour le service Garmin.');
        offset=result.next_offset;total+=result.imported;
        if(result.done){setMessage(`Historique terminé : ${total} nouvelles activités depuis ${since}.`);return}
      }
      setMessage('Import arrêté après le lot en cours. Vous pouvez le relancer sans doublons.');
    }catch(e){setMessage(e instanceof Error?e.message:'Import interrompu. Vous pouvez le relancer sans doublons.')}
    finally{setHistoryRunning(false);setBusy(false);onRefresh()}
  }
  async function login(){
    setBusy(true);setMessage('');const secret=password;setPassword('');
    try{
      const result=await call('/garmin/connect',{email,password:secret});
      if(result.status==='mfa_required')setChallenge(result.challenge_id);
      else{setConnected(true);setMessage('Garmin connecté. Vous pouvez synchroniser vos activités.');onRefresh()}
    }catch(e){setMessage(e instanceof Error?e.message:'Connexion Garmin impossible.')}finally{setBusy(false)}
  }
  async function verify(){
    setBusy(true);setMessage('');const otp=code;setCode('');
    try{await call('/garmin/mfa',{challenge_id:challenge,code:otp});setChallenge('');setConnected(true);setMessage('Garmin connecté. Vous pouvez synchroniser vos activités.');onRefresh()}
    catch(e){setMessage(e instanceof Error?e.message:'Vérification Garmin impossible.')}finally{setBusy(false)}
  }
  return <div className="garmin-connection"><h3>Connexion Garmin</h3>{!loaded?<p>Vérification du service Garmin…</p>:!url?<p>La connexion Garmin depuis le site nécessite l’activation du service HTTPS. <a href="https://github.com/Patfoort47-gif/Sport/blob/main/docs/garmin-web.md" target="_blank" rel="noreferrer">Activer le service une seule fois</a> ; aucun script à exécuter sur vos appareils.</p>:<><p>Vos identifiants sont transmis par HTTPS à votre service de connexion Garmin. Le mot de passe n’est conservé ni dans le navigateur ni dans la base de données ; seule la session Garmin est enregistrée côté serveur.</p>{connected&&!challenge&&<p>● Une session Garmin est enregistrée. <button disabled={busy} onClick={async()=>{setBusy(true);try{await call('/garmin/sync',{});setMessage('Synchronisation lancée pour les 20 activités les plus récentes. La liste se met à jour automatiquement.');onRefresh()}catch(e){setMessage(e instanceof Error?e.message:'Synchronisation impossible.')}finally{setBusy(false)}}}>Synchroniser maintenant</button></p>}{connected&&!challenge&&<div className="history-import"><h4>Récupérer tout mon historique Garmin</h4><p>Import automatique par lots de 20 depuis la date choisie, sans limite au dernier mois. Gardez cet onglet ouvert. En cas d’interruption, relancez : les activités déjà importées ne sont pas téléchargées à nouveau.</p><label>Historique depuis<input type="date" aria-label="Historique depuis" value={since} min="1990-01-01" max={new Date().toISOString().slice(0,10)} disabled={busy} onChange={e=>setSince(e.target.value)}/></label><button disabled={busy||!since} onClick={importHistory}>Récupérer mon historique</button>{historyRunning&&<button onClick={()=>{stopHistory.current=true;setMessage('Arrêt demandé : le lot en cours va se terminer.')}}>Arrêter après ce lot</button>}</div>}{challenge?<form onSubmit={e=>{e.preventDefault();verify()}}><label>Code de vérification Garmin<input required autoComplete="one-time-code" inputMode="numeric" value={code} minLength={4} maxLength={12} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy}>Valider le code Garmin</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await call('/garmin/challenge/'+challenge,undefined,'DELETE');setChallenge('');setCode('');setMessage('')}catch(e){setMessage(e instanceof Error?e.message:'Annulation impossible.')}finally{setBusy(false)}}}>Recommencer</button></form>:<form onSubmit={e=>{e.preventDefault();login()}}><label>E-mail Garmin<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mot de passe Garmin<input type="password" autoComplete="off" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'Connexion en cours…':connected?'Reconnecter Garmin':'Connecter Garmin'}</button></form>}</>}{message&&<p role="status">{message}</p>}</div>;
}
