import {expect,it} from 'vitest';
import {trainingWindow} from '../src/training';
import type {Activity} from '../src/activities';
const activity=(date:string,hours:number):Activity=>({id:date,title:'Séance',sport_type:'running',start_time:date,duration_seconds:hours*3600,distance_meters:1000,total_elevation_gain:0,avg_heart_rate:null});
it('fills empty weeks and compares two four-week windows in UTC',()=>{
 const result=trainingWindow([activity('2026-10-20T10:00:00Z',2),activity('2026-10-19T08:00:00Z',1),activity('2026-09-20T12:00:00Z',2)])!;
 expect(result.weeks).toHaveLength(12);expect(result.days).toHaveLength(84);
 expect(result.weeks.at(-1)?.hours).toBe(3);expect(result.recent).toBe(3);expect(result.previous).toBe(2);expect(result.change).toBe(50);
 expect(result.activeWeeks).toBe(2);expect(result.activeDays).toBe(3);expect(result.days.filter(d=>d.future)).toHaveLength(5);
});
it('handles missing baseline and anchors historical selections to their last activity',()=>{
 expect(trainingWindow([])).toBeNull();
 const result=trainingWindow([activity('2018-01-01T23:00:00Z',1)])!;
 expect(result.end).toBe('2018-01-01');expect(result.change).toBeNull();expect(result.weeks.at(-1)?.date).toBe('2018-01-01');
});
