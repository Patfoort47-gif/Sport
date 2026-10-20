import type {Activity} from './activities';

export type CoachDecision='accepted'|'refused';
export type CoachSuggestion={id:string;sport:string;title:string;duration:number;intensity:string;reason:string;details:string};
export type CoachFeedback=Record<string,CoachDecision>;
const sports=['running','cycling','swimming'] as const;
const names:Record<string,string>={running:'Course à pied',cycling:'Vélo',swimming:'Natation'};

export function coachSuggestions(items:Activity[],feedback:CoachFeedback={},now=new Date()):CoachSuggestion[]{
  const end=now.getTime(),start=end-28*86_400_000;
  const recent=items.filter(a=>{const time=Date.parse(a.start_time);return Number.isFinite(time)&&time>=start&&time<=end});
  const hours=Object.fromEntries(sports.map(s=>[s,recent.filter(a=>a.sport_type===s).reduce((n,a)=>n+Math.max(0,a.duration_seconds),0)/3600])) as Record<string,number>;
  const total=Object.values(hours).reduce((a,b)=>a+b,0);
  const refusedSports=new Set(Object.entries(feedback).filter(([,v])=>v==='refused').map(([id])=>id.split('-')[0]));
  const ordered=[...sports].sort((a,b)=>(refusedSports.has(a)?1:0)-(refusedSports.has(b)?1:0)||hours[a]-hours[b]);
  const light=total<2,high=total>=12;
  const templates:Record<string,Omit<CoachSuggestion,'id'|'sport'|'reason'>>={
    running:{title:'Course facile en aisance',duration:light?30:40,intensity:'Facile · RPE 3/10',details:'10 min très souples, allure conversationnelle, puis 5 min de retour au calme.'},
    cycling:{title:'Endurance vélo fluide',duration:light?45:60,intensity:'Modérée · RPE 4/10',details:'Cadence confortable et régulière, sans chercher la puissance dans les côtes.'},
    swimming:{title:'Technique et relâchement',duration:light?30:45,intensity:'Facile · RPE 3/10',details:'Échauffement progressif, éducatifs courts, puis nage continue relâchée.'},
  };
  const recovery:CoachSuggestion={id:'recovery-mobility',sport:'recovery',title:'Récupération active',duration:25,intensity:'Très facile · RPE 2/10',details:'Marche souple et mobilité des chevilles, hanches et épaules.',reason:high?'Votre volume des 4 dernières semaines invite à consolider la récupération.':'Une séance légère entretient l’élan sans ajouter de fatigue.'};
  const suggestions=ordered.map((sport,index):CoachSuggestion=>({id:`${sport}-${light?'restart':high?'recover':'build'}-${index}`,sport,title:templates[sport].title,duration:templates[sport].duration,intensity:templates[sport].intensity,details:templates[sport].details,reason:hours[sport]===0?`${names[sport]} est absente de vos 4 dernières semaines.`:`${names[sport]} représente ${hours[sport].toLocaleString('fr-FR',{maximumFractionDigits:1})} h sur 4 semaines.`}));
  if(high)suggestions.splice(1,0,recovery);
  return suggestions.filter(s=>feedback[s.id]!=='refused').slice(0,3);
}

export function loadCoachFeedback():CoachFeedback{
  try{const value=JSON.parse(localStorage.getItem('sport-coach-feedback')||'{}');return value&&typeof value==='object'?value:{}}catch{return {}}
}
export function saveCoachFeedback(value:CoachFeedback){localStorage.setItem('sport-coach-feedback',JSON.stringify(value))}
