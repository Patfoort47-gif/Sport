import {expect,it} from 'vitest';
import {aggregate,sportGroup} from '../src/Overview';
import type {Activity} from '../src/activities';
const item=(sport_type:string,start_time:string,duration_seconds:number,distance_meters:number):Activity=>({id:'a',title:'Test',sport_type,start_time,duration_seconds,distance_meters,total_elevation_gain:0,avg_heart_rate:null});
it('aggregates all years chronologically with hours and kilometres separated',()=>{
 const result=aggregate([item('cycling','2026-02-01',7200,40000),item('running','2018-01-01',1800,5000),item('walking','2018-01-02',1800,2000)]);
 expect(result.months).toEqual([['2018-01',{count:2,hours:1,km:7}],['2026-02',{count:1,hours:2,km:40}]]);
 expect(result.sports).toContainEqual(['other',.5]);
 expect(sportGroup('swimming')).toBe('swimming');
 expect(aggregate([])).toEqual({months:[],sports:[]});
});
