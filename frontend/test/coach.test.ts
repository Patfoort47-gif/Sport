import {expect,it} from 'vitest';
import {coachSuggestions} from '../src/coach';
import type {Activity} from '../src/activities';
const activity=(sport_type:string,duration_seconds:number):Activity=>({id:sport_type,title:'Test',sport_type,start_time:'2026-10-15T08:00:00Z',duration_seconds,distance_meters:0,total_elevation_gain:0,avg_heart_rate:null});

it('prioritizes a missing discipline and adapts after a refusal',()=>{
  const items=[activity('running',7200),activity('cycling',3600)];
  const first=coachSuggestions(items,{},new Date('2026-10-20T12:00:00Z'));
  expect(first[0].sport).toBe('swimming');
  const next=coachSuggestions(items,{[first[0].id]:'refused'},new Date('2026-10-20T12:00:00Z'));
  expect(next.map(s=>s.id)).not.toContain(first[0].id);
  expect(next[0].sport).not.toBe('swimming');
});

it('adds recovery when recent volume is high',()=>{
  const result=coachSuggestions([activity('running',13*3600)],{},new Date('2026-10-20T12:00:00Z'));
  expect(result.some(s=>s.sport==='recovery')).toBe(true);
});
