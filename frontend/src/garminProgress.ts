const DAY = 86_400_000;

export type HistoryProgress = {
  percent: number;
  remainingSeconds: number | null;
};

export function historyProgress(since:string, oldestDate:string|null, elapsedSeconds:number, done=false):HistoryProgress {
  if(done)return {percent:100,remainingSeconds:0};
  const start=Date.parse(`${since}T00:00:00Z`);
  const end=Date.now();
  const cursor=oldestDate?Date.parse(`${oldestDate}T00:00:00Z`):end;
  if(!Number.isFinite(start)||!Number.isFinite(cursor)||start>=end)return {percent:0,remainingSeconds:null};
  const total=Math.max(DAY,end-start);
  const covered=Math.max(0,Math.min(total,end-cursor));
  const fraction=covered/total;
  const percent=Math.min(99,Math.max(1,Math.round(fraction*100)));
  const remainingSeconds=fraction>.01&&elapsedSeconds>0?Math.max(1,Math.round(elapsedSeconds*(1-fraction)/fraction)):null;
  return {percent,remainingSeconds};
}

export function shortDuration(seconds:number|null){
  if(seconds===null)return 'calcul en cours';
  if(seconds<60)return 'moins d’une minute';
  const minutes=Math.ceil(seconds/60);
  if(minutes<60)return `environ ${minutes} min`;
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return `environ ${hours} h${rest?` ${rest} min`:''}`;
}
