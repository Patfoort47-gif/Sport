import {useEffect,useRef} from 'react';
import {Chart,BarController,BarElement,CategoryScale,LinearScale,Tooltip,Legend} from 'chart.js';
import type {Activity} from './activities';
Chart.register(BarController,BarElement,CategoryScale,LinearScale,Tooltip,Legend);
export const sportNames:Record<string,string>={swimming:'Natation',running:'Course à pied',cycling:'Vélo',multisport:'Multisport',other:'Autres'};
export const sportGroup=(sport:string)=>['swimming','running','cycling','multisport'].includes(sport)?sport:'other';
export function aggregate(items:Activity[]){
  const months=new Map<string,{count:number;hours:number;km:number}>();
  const sports=new Map<string,number>();
  for(const a of items){
    const month=a.start_time.slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(month))continue;
    const row=months.get(month)??{count:0,hours:0,km:0};
    row.count++;row.hours+=a.duration_seconds/3600;row.km+=a.distance_meters/1000;months.set(month,row);
    const sport=sportGroup(a.sport_type);sports.set(sport,(sports.get(sport)??0)+a.duration_seconds/3600);
  }
  return {months:[...months.entries()].sort(([a],[b])=>a.localeCompare(b)),sports:[...sports.entries()]};
}
function Bars({labels,values,label,color}:{labels:string[];values:number[];label:string;color:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const chart=new Chart(ref.current,{type:'bar',data:{labels,datasets:[{label,data:values,backgroundColor:color,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true},x:{ticks:{maxTicksLimit:12}}}}});
    return()=>chart.destroy();
  },[labels,values,label,color]);
  return <div style={{height:280,minWidth:0}}><canvas ref={ref} role="img" aria-label={label}/></div>;
}
export function Overview({items}:{items:Activity[]}){
  const {months,sports}=aggregate(items);
  return <section aria-label="Statistiques générales"><h2>Statistiques générales</h2><p>Toutes les activités de la sélection · {items.length} séance(s). Les mois affichés sont ceux comportant des activités.</p>{!items.length?<p>Aucune activité pour ces filtres. Importez vos séances ou modifiez la sélection.</p>:<div className="overview-grid">
    <article><h3>Volume mensuel (heures)</h3><Bars labels={months.map(([m])=>m)} values={months.map(([,v])=>v.hours)} label="Heures par mois" color="#148675"/></article>
    <article><h3>Distance mensuelle (km)</h3><Bars labels={months.map(([m])=>m)} values={months.map(([,v])=>v.km)} label="Kilomètres par mois" color="#5788c7"/></article>
    <article><h3>Nombre de séances par mois</h3><Bars labels={months.map(([m])=>m)} values={months.map(([,v])=>v.count)} label="Séances par mois" color="#8b5cb5"/></article>
    <article><h3>Répartition par sport (heures)</h3><Bars labels={sports.map(([s])=>sportNames[s])} values={sports.map(([,v])=>v)} label="Heures par sport" color="#d18b42"/></article>
  </div>}</section>;
}
