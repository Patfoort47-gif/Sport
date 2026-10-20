import {useEffect, useMemo, useRef, useState} from 'react';
import {Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Filler, type ChartEvent, type Plugin} from 'chart.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {Detail} from './activities';
import {analysisPoints, finiteNumber, formatElapsed, formatPace, gpsSegments, nearestPoint, type AnalysisPoint, type Metric} from './analysis';
import './ActivityAnalysis.css';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler);
const sports: Record<string, string> = {running:'Course à pied', cycling:'Cyclisme', swimming:'Natation', multisport:'Multisport', transition:'Transition'};
const chartLabels: Record<Metric, string> = {heart_rate:'Fréquence cardiaque', pace:'Allure', altitude:'Altitude', power:'Puissance', cadence:'Cadence'};
const colors: Record<Metric, string> = {heart_rate:'#dc5570', pace:'#0d9488', altitude:'#5788c7', power:'#c17b22', cadence:'#8b5cb5'};
const metricUnit = (metric: Metric, swimming: boolean) => ({heart_rate:'bpm', pace:swimming?'min/100 m':'min/km', altitude:'m', power:'W', cadence:'cycles/min'}[metric]);
const valueLabel = (metric: Metric, value: number | null) => value === null ? '—' : metric === 'pace' ? formatPace(value) : Math.round(value).toLocaleString('fr-FR');

function ActivityMap({activity}: {activity: Detail}) {
  const element = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const segments = useMemo(() => gpsSegments(activity.records), [activity.records]);
  useEffect(() => {
    if (!element.current || !segments.length) return;
    setTileError(false);
    const map = L.map(element.current, {scrollWheelZoom:false, attributionControl:true});
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    });
    tiles.on('tileerror', () => setTileError(true));
    tiles.addTo(map);
    const points = segments.flat();
    for (const segment of segments) {
      if (segment.length > 1) L.polyline(segment, {color:'#0f8a75',weight:4,opacity:.95}).addTo(map);
      else L.circleMarker(segment[0], {radius:4,color:'#0f8a75'}).addTo(map);
    }
    map.fitBounds(L.latLngBounds(points), {padding:[24,24], maxZoom:16});
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element.current);
    return () => {observer.disconnect();tiles.off();map.remove()};
  }, [segments]);
  return <div className="analysis-map-panel">
    <div className="analysis-panel-title"><h3>Votre parcours</h3><span>Carte interactive · OpenStreetMap</span></div>
    {segments.length ? <><div ref={element} className="analysis-map" data-testid="activity-map" aria-label="Carte du parcours GPS" />
      <p className="analysis-note">Déplacez la carte et utilisez + / − pour explorer le parcours.</p>
      {tileError && <p className="analysis-note">Fond de carte indisponible : le tracé GPS reste visible. Une connexion Internet est nécessaire pour OpenStreetMap.</p>}</>
      : <p className="analysis-no-data">Aucune position GPS dans cette activité. Les séances en intérieur restent consultables dans les graphiques.</p>}
  </div>;
}

type MetricChartProps = {points: AnalysisPoint[];metric: Metric;swimming: boolean;range:[number,number];selected:number|null;onHover:(index:number|null)=>void};
function MetricChart({points,metric,swimming,range,selected,onHover}:MetricChartProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Chart<'line', {x:number;y:number|null}[]> | null>(null);
  const cursor = useRef(selected);
  cursor.current = selected;
  const hasValues = points.some(point => point[metric] !== null);
  useEffect(() => {
    if (!canvas.current || !hasValues) return;
    const unit = metricUnit(metric, swimming);
    const hover = (event: ChartEvent, chart: Pick<Chart, 'scales'>) => {
      if (event.x === null || event.type === 'mouseout') {onHover(null);return}
      const seconds = chart.scales.x.getValueForPixel(event.x);
      if (seconds !== undefined) onHover(nearestPoint(points, seconds));
    };
    const guide: Plugin<'line'> = {
      id:'shared-cursor',
      afterDraw(chart) {
        const index = cursor.current;
        if (index === null || !points[index]) return;
        const x = chart.scales.x.getPixelForValue(points[index].elapsed);
        const {top,bottom,left,right} = chart.chartArea;
        if (x < left || x > right) return;
        const context = chart.ctx;
        context.save();context.setLineDash([4,4]);context.strokeStyle='#81948f';context.lineWidth=1;
        context.beginPath();context.moveTo(x,top);context.lineTo(x,bottom);context.stroke();context.restore();
      },
    };
    const chart = new Chart(canvas.current, {
      type:'line',
      data:{datasets:[{label:`${chartLabels[metric]} (${unit})`, data:points.map(point=>({x:point.elapsed,y:point[metric]})), borderColor:colors[metric], backgroundColor:colors[metric]+'15',fill:true,spanGaps:false,pointRadius:0,pointHoverRadius:4,borderWidth:2,tension:0}]},
      options:{
        responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
        interaction:{mode:'nearest',axis:'x',intersect:false},
        onHover:(event,_elements,chart)=>hover(event,chart),
        onClick:(event,_elements,chart)=>hover(event,chart),
        plugins:{
          tooltip:{callbacks:{title:items=>items.length?`Temps écoulé : ${formatElapsed(items[0].parsed.x ?? 0)}`:'', label:item=>`${chartLabels[metric]} : ${valueLabel(metric,item.parsed.y)} ${unit}`}},
        },
        scales:{
          x:{type:'linear',min:range[0],max:range[1],title:{display:true,text:'Temps écoulé'},grid:{color:'#edf1ef'},ticks:{maxTicksLimit:7,maxRotation:0,callback:value=>formatElapsed(Number(value))}},
          y:{type:'linear',reverse:metric==='pace',title:{display:true,text:unit},afterFit:scale=>{scale.width=66},grid:{color:'#edf1ef'},ticks:{maxTicksLimit:5,callback:value=>metric==='pace'?formatPace(Number(value)):value}},
        },
      },
      plugins:[guide],
    });
    instance.current=chart;
    return()=>{instance.current=null;chart.destroy()};
  },[points,metric,swimming,range[0],range[1],hasValues,onHover]);
  useEffect(()=>{
    const chart=instance.current;
    if(!chart)return;
    const point=selected===null?null:points[selected];
    const visible=point && point.elapsed>=range[0] && point.elapsed<=range[1];
    const active=visible && point[metric]!==null ? [{datasetIndex:0,index:selected!}] : [];
    chart.setActiveElements(active);
    chart.tooltip?.setActiveElements(active,{x:point?chart.scales.x.getPixelForValue(point.elapsed):0,y:chart.chartArea.top+25});
    chart.draw();
  },[selected,points,metric,range]);
  return <article className="analysis-chart-panel" onMouseLeave={()=>onHover(null)}>
    <div className="analysis-panel-title"><h3><span className="metric-dot" style={{backgroundColor:colors[metric]}} />{chartLabels[metric]}</h3><span>{metricUnit(metric,swimming)}</span></div>
    {hasValues?<div className="analysis-chart"><canvas ref={canvas} data-testid={`chart-${metric}`} role="img" aria-label={`Graphique ${chartLabels[metric].toLowerCase()} en fonction du temps`}/></div>:<p className="analysis-no-data">Aucune mesure de {chartLabels[metric].toLowerCase()} dans ce fichier.</p>}
  </article>;
}

export function ActivityAnalysis({activity,onClose}:{activity:Detail;onClose:()=>void}) {
  const points=useMemo(()=>analysisPoints(activity),[activity]);
  const maximum=Math.max(1,Math.ceil(points.at(-1)?.elapsed??0));
  const [range,setRange]=useState<[number,number]>([0,maximum]);
  const [selected,setSelected]=useState<number|null>(null);
  const [extra,setExtra]=useState<'none'|'power'|'cadence'>('none');
  const swimming=activity.sport_type==='swimming';
  useEffect(()=>{setRange([0,maximum]);setSelected(null)},[activity.id,maximum]);
  const hovered=selected===null?null:points[selected];
  const setWindow=(value:[number,number])=>{setRange(value);setSelected(null)};
  const duration=(seconds:unknown)=>{const value=finiteNumber(seconds);return value===null?'—':formatElapsed(value)};
  const distance=(metres:unknown)=>{const value=finiteNumber(metres);return value===null?'—':`${(value/1000).toFixed(2)} km`};
  return <section className="activity-analysis rounded-xl bg-white" aria-label="Analyse de l’activité">
    <div className="sectionhead"><div><span className="eyebrow">COMPRENDRE VOTRE EFFORT</span><h2>{sports[activity.sport_type]||activity.title} · Analyse</h2></div><button onClick={onClose}>Fermer</button></div>
    <div className="legs">{activity.sessions.map((session,index)=><article key={index}><b>{sports[session.sport]||session.sport||'Session'}</b><p>{duration(session.total_timer_time)} · {distance(session.total_distance)}</p></article>)}</div>
    <ActivityMap activity={activity}/>
    <div className="analysis-section-title"><div><h3>Vos mesures, au même instant</h3><p>Survolez une courbe pour comparer les valeurs. Ajustez la plage pour zoomer sur un intervalle.</p></div><label>Mesure supplémentaire<select value={extra} onChange={event=>setExtra(event.target.value as typeof extra)}><option value="none">Aucune</option><option value="power">Puissance</option><option value="cadence">Cadence</option></select></label></div>
    {points.length>0&&<>
      <div className="analysis-window"><label>Début<input type="range" aria-label="Début de la plage" min={0} max={maximum-1} step={1} value={range[0]} onChange={event=>setWindow([Math.min(Number(event.target.value),range[1]-1),range[1]])}/></label><label>Fin<input type="range" aria-label="Fin de la plage" min={1} max={maximum} step={1} value={range[1]} onChange={event=>setWindow([range[0],Math.max(Number(event.target.value),range[0]+1)])}/></label><output data-testid="analysis-range">{formatElapsed(range[0])} — {formatElapsed(range[1])}</output><button onClick={()=>setWindow([0,maximum])} disabled={range[0]===0&&range[1]===maximum}>Réinitialiser le zoom</button></div>
      <div className="analysis-cursor" data-testid="analysis-cursor" role="tooltip" aria-label="Valeurs synchronisées">
        <b>{hovered?`Temps écoulé : ${formatElapsed(hovered.elapsed)}`:'Survolez les courbes'}</b>
        {(['heart_rate','pace','altitude',...(extra==='none'?[]:[extra])] as Metric[]).map(metric=><span key={metric}><i className="metric-dot" style={{backgroundColor:colors[metric]}}/>{chartLabels[metric]} : <strong>{valueLabel(metric,hovered?.[metric]??null)}</strong> {metricUnit(metric,swimming)}</span>)}
      </div>
    </>}
    {!points.length&&<p className="analysis-no-data">Aucun échantillon horodaté dans ce fichier. Les métriques globales et les tours restent consultables.</p>}
    <div className="analysis-chart-stack">{(['heart_rate','pace','altitude',...(extra==='none'?[]:[extra])] as Metric[]).map(metric=><MetricChart key={metric} points={points} metric={metric} swimming={swimming} range={range} selected={selected} onHover={setSelected}/>)}</div>
    <h3 className="analysis-laps-title">Tours</h3>
    {activity.laps.length?<div className="tablewrap"><table><thead><tr><th>TOUR</th><th>DISTANCE</th><th>DURÉE</th><th>FC MOY.</th></tr></thead><tbody>{activity.laps.map((lap,index)=><tr key={index}><td>{index+1}</td><td>{distance(lap.total_distance)}</td><td>{duration(lap.total_timer_time)}</td><td>{finiteNumber(lap.avg_heart_rate)??'—'} bpm</td></tr>)}</tbody></table></div>:<p className="analysis-note">Aucun tour enregistré dans ce fichier.</p>}
  </section>;
}
