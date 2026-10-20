import {useMemo,useState} from 'react';
import type {Activity} from './activities';
import {coachSuggestions,loadCoachFeedback,saveCoachFeedback,type CoachDecision,type CoachFeedback} from './coach';

const icons:Record<string,string>={running:'⌁',cycling:'↗',swimming:'≈',recovery:'○'};
export function Coach({items}:{items:Activity[]}){
  const [feedback,setFeedback]=useState<CoachFeedback>(loadCoachFeedback);
  const suggestions=useMemo(()=>coachSuggestions(items,feedback),[items,feedback]);
  function decide(id:string,decision:CoachDecision){
    setFeedback(previous=>{const next={...previous,[id]:decision};saveCoachFeedback(next);return next});
  }
  const accepted=Object.values(feedback).filter(v=>v==='accepted').length;
  return <section className="coach" aria-label="Coach adaptatif">
    <div className="coach-hero"><div><span className="eyebrow">COACH ADAPTATIF</span><h2>Votre prochaine séance, au bon dosage.</h2><p>Des idées basées sur les 4 dernières semaines. Elles ne remplacent pas un avis médical ni les sensations du jour.</p></div><div className="coach-pulse"><strong>{items.length}</strong><span>séances analysées</span><small>{accepted} proposition(s) acceptée(s)</small></div></div>
    <div className="coach-note"><span>✦</span><p><strong>Conseil du moment</strong> Gardez au moins une journée légère entre deux efforts exigeants et réduisez la séance si la fatigue paraît inhabituelle.</p></div>
    <div className="session-grid">{suggestions.map((session,index)=><article className="session-card" key={session.id}><div className="session-top"><i>{icons[session.sport]}</i><span>PROPOSITION {index+1}</span>{feedback[session.id]==='accepted'&&<b>✓ Acceptée</b>}</div><h3>{session.title}</h3><div className="session-metrics"><strong>{session.duration} min</strong><span>{session.intensity}</span></div><p>{session.details}</p><small>{session.reason}</small><div className="coach-actions"><button className="accept" disabled={feedback[session.id]==='accepted'} onClick={()=>decide(session.id,'accepted')}>{feedback[session.id]==='accepted'?'Ajoutée à mon intention':'Accepter'}</button><button onClick={()=>decide(session.id,'refused')}>Refuser</button></div></article>)}</div>
    {!suggestions.length&&<div className="empty"><h3>Vos choix sont enregistrés.</h3><p>Revenez après vos prochaines activités : le coach préparera de nouvelles propositions.</p></div>}
    <p className="coach-privacy">Vos retours restent dans ce navigateur et servent à réordonner les prochaines propositions.</p>
  </section>;
}
