import {useEffect,useRef,useState} from 'react';
import {Chart,BarController,BarElement,CategoryScale,LinearScale,Tooltip,Legend,LineController,LineElement,PointElement,Filler,DoughnutController,ArcElement} from 'chart.js';
import {trainingWindow} from './training';
import type {Activity} from './activities';
Chart.register(BarController,BarElement,CategoryScale,LinearScale,Tooltip,Legend,LineController,LineElement,PointElement,Filler,DoughnutController,ArcElement);
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
    const chart=new Chart(ref.current,{type:'bar',data:{labels,datasets:[{label,data:values,backgroundColor:color,borderRadius:4}]},options:{animation:false,responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true},x:{ticks:{maxTicksLimit:12}}}}});
    return()=>chart.destroy();
  },[labels,values,label,color]);
  return <div style={{height:280,minWidth:0}}><canvas ref={ref} role="img" aria-label={label}/></div>;
}

function FocusChart({labels,values,ring=false}:{labels:string[];values:number[];ring?:boolean}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const chart=new Chart(ref.current,{type:ring?'doughnut':'line',data:{labels,datasets:[{label:'Heures',data:values,borderColor:ring?'#ffffff':'#17a58b',backgroundColor:ring?['#17a58b','#568ee7','#b287dc','#e8ab5b','#9aaab5']:'#17a58b25',borderWidth:ring?4:3,fill:true,tension:.25,pointRadius:3}]},options:{animation:false,responsive:true,maintainAspectRatio:false,plugins:{legend:{display:ring,position:'bottom'},tooltip:{callbacks:{label:item=>`${item.dataset.label} : ${Number(ring?item.parsed:item.parsed.y).toLocaleString('fr-FR',{maximumFractionDigits:2})}`}}},...(ring?{cutout:'72%'}:{scales:{y:{beginAtZero:true,title:{display:true,text:'Heures'}},x:{grid:{display:false},ticks:{maxTicksLimit:6}}}})}});
    return()=>chart.destroy();
  },[labels,values,ring]);
  return <div className="focus-chart"><canvas ref={ref} role="img" aria-label={ring?'Répartition du temps par discipline':'Volume hebdomadaire sur 12 semaines'}/></div>;
}
const decimal=(value:number)=>value.toLocaleString('fr-FR',{maximumFractionDigits:1});
export function Overview({items}:{items:Activity[]}){
  const [selectedDay,setSelectedDay]=useState('');
  useEffect(()=>setSelectedDay(''),[items]);
  const {months,sports}=aggregate(items);
  const window=trainingWindow(items);
  return <section className="training-overview" aria-label="Statistiques générales"><div className="overview-heading"><div><span className="eyebrow">VOTRE VUE D’ENSEMBLE</span><h2>Statistiques générales</h2></div><p>{items.length} séance(s) dans la sélection</p></div>{!items.length||!window?<div className="empty"><h3>Votre progression commence avec vos données.</h3><p>Aucune activité pour ces filtres. Importez vos séances via « Importer un FIT », connectez Garmin dans « Compte et Garmin » ou modifiez la sélection.</p></div>:<>
    <div className="training-insights">
      <article><span>RÉGULARITÉ</span><strong>{window.activeWeeks}<small> / 12 semaines</small></strong><p>avec au moins une séance · {window.activeDays} jours actifs</p></article>
      <article><span>VOLUME RÉCENT</span><strong>{decimal(window.recent)}<small> heures</small></strong><p>sur les 4 dernières semaines calendaires affichées</p></article>
      <article><span>ÉVOLUTION DU VOLUME</span><strong>{window.change===null?'—':`${window.change>0?'+':''}${decimal(window.change)} %`}</strong><p>{window.change===null?'Pas de volume sur les 4 semaines précédentes pour comparer.':'par rapport aux 4 semaines précédentes · dernière semaine potentiellement incomplète'}</p></article>
    </div>
    <p className="analysis-period">Fenêtre de régularité : du {window.days[0].date} au {window.end}, dernière activité de la sélection. Les semaines sans séance comptent pour zéro. Ces indicateurs décrivent le volume enregistré, pas votre forme physique.</p>
    <div className="overview-feature-grid">
      <article className="chart-card"><span className="eyebrow">LE RYTHME DE VOS SEMAINES</span><h3>Construisez votre régularité</h3><p>12 semaines de volume, pauses comprises.</p><FocusChart labels={window.weeks.map(w=>w.date)} values={window.weeks.map(w=>w.hours)}/></article>
      <article className="chart-card"><span className="eyebrow">L’ÉQUILIBRE DES DISCIPLINES</span><h3>Où passe votre temps ?</h3><p>Temps total par sport dans la sélection.</p><FocusChart ring labels={sports.map(([s])=>sportNames[s])} values={sports.map(([,v])=>v)}/></article>
    </div>
    <article className="chart-card consistency"><div><span className="eyebrow">CHAQUE SÉANCE COMPTE</span><h3>Votre calendrier d’entraînement</h3><p>12 semaines · survolez une case ou sélectionnez-la au clavier pour lire le détail.</p></div><div className="training-calendar" aria-label="Calendrier des jours entraînés">{window.days.map(d=><button key={d.date} className={d.future?'future':d.count?'trained':''} style={!d.future&&d.count?{backgroundColor:d.hours>=2?'#126857':d.hours>=1?'#259c81':'#9bd9c4'}:{}} title={`${d.date} : ${d.count} séance(s), ${decimal(d.hours)} h`} aria-label={`${d.date} : ${d.count} séance(s), ${decimal(d.hours)} heures`} onClick={()=>setSelectedDay(`${d.date} : ${d.count} séance(s), ${decimal(d.hours)} h`)}/>)}</div><p role="status" className="calendar-readout">{selectedDay||'Clair : moins de 1 h · moyen : 1 à 2 h · foncé : 2 h et plus.'}</p></article>
    <div className="overview-grid">
      <article className="chart-card"><h3>Volume mensuel (heures)</h3><Bars labels={months.map(([m])=>m)} values={months.map(([,v])=>v.hours)} label="Heures par mois" color="#148675"/></article>
      <article className="chart-card"><h3>Distance mensuelle (km)</h3><p>Les distances des disciplines sont additionnées ; filtrez un sport pour les comparer.</p><Bars labels={months.map(([m])=>m)} values={months.map(([,v])=>v.km)} label="Kilomètres par mois" color="#5788c7"/></article>
      <article className="chart-card"><h3>Nombre de séances par mois</h3><Bars labels={months.map(([m])=>m)} values={months.map(([,v])=>v.count)} label="Séances par mois" color="#8b5cb5"/></article>
      <article className="chart-card"><h3>Vos repères par discipline</h3><div className="sport-breakdown">{sports.map(([sport,hours])=><div key={sport}><span>{sportNames[sport]}</span><strong>{decimal(hours)} h</strong><small>{items.filter(a=>sportGroup(a.sport_type)===sport).length} séances</small></div>)}</div><p>Les graphiques mensuels affichent les mois contenant des activités de la sélection.</p></article>
    </div></>}
  </section>;
}
