import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {Overview, sportGroup} from './Overview';
import {Account} from './Account';
import {ActivityAnalysis} from './ActivityAnalysis';
import {listActivities, getActivity, importFiles, type Activity, type Detail} from './activities';

const names: Record<string,string> = {
  swimming:'Natation', cycling:'Cyclisme', running:'Course à pied', multisport:'Multisport', transition:'Transition',
};
const symbols: Record<string,string> = {swimming:'≈', cycling:'↗', running:'⌁', multisport:'◇'};
const number = (n: number, digits = 0) => n.toLocaleString('fr-FR', {maximumFractionDigits:digits, minimumFractionDigits:digits});
const duration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600 ? `${Math.floor(s/3600)} h ${Math.floor(s%3600/60).toString().padStart(2,'0')}` : `${Math.floor(s/60)} min ${String(s%60).padStart(2,'0')} s`;
};
const date = (timestamp: string) => {
  const value = new Date(timestamp);
  return Number.isFinite(value.getTime()) ? value.toLocaleString('fr-FR', {dateStyle:'medium',timeStyle:'short'}) : 'Date indisponible';
};

function App({cloud = false}: {cloud?: boolean}) {
  const [page,setPage]=useState('activities');
  const navigate=(next:string)=>{setPage(next);setDetail(null);window.scrollTo({top:0,behavior:'smooth'})};
  const [items, setItems] = useState<Activity[]>([]);
  const [sport, setSport] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [detail, setDetail] = useState<Detail|null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string|null>(null);
  const importing = useRef(false);
  const dragDepth = useRef(0);
  const selected = useRef<string|null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reload = async () => {
    try {setItems(await listActivities())}
    catch (error) {setMessage(error instanceof Error ? error.message : 'Impossible de charger les activités.')}
    finally {setLoading(false)}
  };
  useEffect(() => {
    reload();
    if (!cloud) return;
    const timer = window.setInterval(reload,60000);
    return () => window.clearInterval(timer);
  },[cloud]);

  const invalidDates = !!(start && end && start > end);
  const filtered = items.filter(a => !invalidDates && (!sport || (sport==='other'?sportGroup(a.sport_type)==='other':a.sport_type===sport)) && (!start || a.start_time.slice(0,10)>=start) && (!end || a.start_time.slice(0,10)<=end));
  async function upload(files: FileList|null) {
    if (!files?.length || importing.current) return;
    importing.current = true;
    setBusy(true);
    setMessage('');
    try {
      const results = await importFiles(Array.from(files));
      setMessage(results.map(result => `${result.file} : ${result.error || (result.status==='imported' ? 'importé' : 'déjà présent')}`).join(' · '));
      await reload();
    } catch (error) {setMessage(error instanceof Error ? error.message : 'Import impossible.')}
    finally {importing.current = false; setBusy(false)}
  }
  async function openActivity(id: string) {
    selected.current = id;
    setOpening(id);
    try {
      const next = await getActivity(id);
      if (selected.current === id) setDetail(next);
    } catch (error) {setMessage(error instanceof Error ? error.message : 'Impossible d’ouvrir cette activité.')}
    finally {if (selected.current === id) setOpening(null)}
  }

  return <div className="layout">
    <aside>
      <div className="brand">◈ TRIATHLON<span>CARNET SPORTIF</span></div>
      <nav aria-label="Navigation principale">{[['overview','Statistiques générales'],['activities','Mes activités'],['import','Importer un FIT']].map(([key,label])=><button key={key} aria-current={page===key?'page':undefined} onClick={()=>navigate(key)}>{label}</button>)}</nav>
      <p>Comprendre l’effort.<br/>Relier les disciplines.<br/>Préparer la suite.</p>
      <small>{cloud ? '● Stockage Supabase privé' : '● Stockage dans ce navigateur'}</small>
    </aside>
    <main>
      <header className="flex flex-wrap items-center justify-between gap-6">
        <div><span className="eyebrow">ENTRAÎNEMENT / TABLEAU DE BORD</span><h1>Chaque effort compte.</h1><p>Natation, vélo, course à pied. Retrouvez votre progression.</p></div>
        <button className="button transition-colors hover:bg-teal-800" disabled={busy} onClick={()=>{setPage('import');input.current?.click()}}>+ Importer des fichiers FIT</button>
      </header>
      <p className="storage-note">{cloud ? 'Vos activités sont enregistrées dans votre compte Supabase et accessibles sur vos appareils après connexion.' : 'Mode local : importez vos fichiers directement, sans compte. Pour les retrouver sur vos autres appareils, connectez-vous à votre compte ci-dessus.'}</p>
      <section hidden={page==='overview'} id="importer" aria-label="Importer des activités" aria-busy={busy} data-testid="fit-dropzone"
        className={`dropzone rounded-xl border-2 border-dashed transition-colors ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={event=>{event.preventDefault();dragDepth.current++;setDragging(true)}}
        onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=busy?'none':'copy'}}
        onDragLeave={event=>{event.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false)}}
        onDrop={event=>{event.preventDefault();dragDepth.current=0;setDragging(false);upload(event.dataTransfer.files)}}>
        <span className="drop-icon" aria-hidden="true">↥</span>
        <div><h2>{busy ? 'Lecture de vos fichiers…' : 'Déposez vos entraînements ici'}</h2><p>Un fichier FIT ou toute une série. Vos données sont analysées directement dans le navigateur.</p><small>Natation · Cyclisme · Course à pied · Multisport &nbsp; / &nbsp; 32 Mo maximum par fichier</small></div>
        <label className={`file-choice ${busy?'disabled':''}`} htmlFor="fit-import">Choisir des fichiers</label>
        <input className="file-input" ref={input} id="fit-import" aria-label="Fichiers FIT" type="file" accept=".fit" multiple disabled={busy}
          onChange={event=>{upload(event.target.files);event.target.value=''}}/>
      </section>
      {message && <p role="status" className="notice">{message}</p>}
      <section aria-label="Filtres des activités">
        {invalidDates && <p className="notice" role="alert">La date de début doit précéder la date de fin.</p>}
          <div className="filters">
            <label>Discipline<select aria-label="Discipline" value={sport} onChange={event=>setSport(event.target.value)}><option value="">Toutes les disciplines</option>{Object.entries(names).filter(([key])=>key!=='transition').map(([key,label])=><option key={key} value={key}>{label}</option>)}<option value="other">Autres activités</option></select></label>
            <label>Du<input aria-label="Date de début" type="date" value={start} onChange={event=>setStart(event.target.value)}/></label>
            <label>Au<input aria-label="Date de fin" type="date" value={end} onChange={event=>setEnd(event.target.value)}/></label>
          </div>
      </section>
      <div className="stats grid grid-cols-2 gap-4 xl:grid-cols-4">
        <article><small>ACTIVITÉS</small><strong>{filtered.length}</strong><span>dans la sélection</span></article>
        <article><small>DURÉE TOTALE</small><strong>{duration(filtered.reduce((n,a)=>n+a.duration_seconds,0))}</strong><span>au chronomètre</span></article>
        <article><small>DISTANCE</small><strong>{number(filtered.reduce((n,a)=>n+a.distance_meters,0)/1000,1)} <em>km</em></strong><span>toutes disciplines</span></article>
        <article><small>DÉNIVELÉ POSITIF</small><strong>{number(filtered.reduce((n,a)=>n+a.total_elevation_gain,0))} <em>m</em></strong><span>de montée cumulée</span></article>
      </div>
      {page==='overview'&&<Overview items={filtered}/>}
      <section hidden={page!=='activities'} id="journal" className="journal-panel rounded-xl bg-white">
        <div className="sectionhead"><div><span className="eyebrow">VOTRE HISTORIQUE</span><h2>Journal d’activités</h2></div>

        </div>

        {loading ? <p>Chargement de votre historique…</p> : !filtered.length ? <div className="empty"><b>{items.length ? 'Aucune activité dans cette sélection.' : 'Votre prochaine aventure commence ici.'}</b><p>{items.length ? 'Ajustez la discipline ou les dates pour retrouver vos séances.' : 'Ajoutez votre premier fichier FIT avec la zone de dépôt ci-dessus.'}</p></div> : <div className="tablewrap"><table>
          <thead><tr><th scope="col">ACTIVITÉ</th><th scope="col">DATE</th><th scope="col">DISTANCE</th><th scope="col">DURÉE</th><th scope="col">DÉNIVELÉ +</th><th scope="col">FC MOY.</th></tr></thead>
          <tbody>{filtered.map(activity=><tr key={activity.id} className="hover:bg-slate-50">
            <td><button className="activity" disabled={opening===activity.id} onClick={()=>openActivity(activity.id)}><i aria-hidden="true">{symbols[activity.sport_type]??'◇'}</i>{names[activity.sport_type]||activity.title}{opening===activity.id&&'…'}</button></td>
            <td>{date(activity.start_time)}</td><td>{number(activity.distance_meters/1000,2)} km</td><td>{duration(activity.duration_seconds)}</td><td>{number(activity.total_elevation_gain)} m</td><td>{activity.avg_heart_rate==null?'—':`${activity.avg_heart_rate} bpm`}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      {page==='activities' && detail && <ActivityAnalysis key={detail.id} activity={detail} onClose={()=>{selected.current=null;setDetail(null)}}/>}
      <footer>TRIATHLON · V2 <span><a href="./fit-file-parser-license.txt">Licence du parseur FIT</a> · <a href="./idb-license.txt">Licence stockage</a></span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Account>{(user,revision)=><App key={`${user?.id??'local'}-${revision}`} cloud={!!user}/>}</Account>);
