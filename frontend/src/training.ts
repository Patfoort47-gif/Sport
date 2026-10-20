import type {Activity} from './activities';
const day=86400000;
export function trainingWindow(items:Activity[]){
  const dated=items.map(a=>({a,time:Date.parse(a.start_time.slice(0,10)+'T00:00:00Z')})).filter(v=>Number.isFinite(v.time));
  if(!dated.length)return null;
  const end=dated.reduce((latest,v)=>Math.max(latest,v.time),-Infinity);
  const monday=end-((new Date(end).getUTCDay()+6)%7)*day;
  const start=monday-77*day;
  const weeks=Array.from({length:12},(_,i)=>({date:new Date(start+i*7*day).toISOString().slice(0,10),hours:0,count:0}));
  const days=Array.from({length:84},(_,i)=>({date:new Date(start+i*day).toISOString().slice(0,10),hours:0,count:0,future:start+i*day>end}));
  for(const {a,time} of dated){
    const index=Math.floor((time-start)/day);
    if(index<0||index>=84)continue;
    const hours=Math.max(0,a.duration_seconds)/3600;
    days[index].hours+=hours;days[index].count++;
    weeks[Math.floor(index/7)].hours+=hours;weeks[Math.floor(index/7)].count++;
  }
  const recent=weeks.slice(-4).reduce((n,w)=>n+w.hours,0);
  const previous=weeks.slice(-8,-4).reduce((n,w)=>n+w.hours,0);
  return {weeks,days,end:new Date(end).toISOString().slice(0,10),recent,previous,change:previous>0?(recent-previous)/previous*100:null,activeWeeks:weeks.filter(w=>w.count>0).length,activeDays:days.filter(d=>d.count>0).length};
}
