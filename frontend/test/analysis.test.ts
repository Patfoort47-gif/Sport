import {describe,expect,it} from 'vitest';
import {analysisPoints,formatElapsed,formatPace,gpsSegments,nearestPoint,paceFromSpeed} from '../src/analysis';

describe('activity chart metrics',()=>{
  it('converts m/s to running and swimming pace, excluding stops and invalid data',()=>{
    expect(paceFromSpeed(4)).toBeCloseTo(4.1666667);
    expect(paceFromSpeed(1,true)).toBeCloseTo(1.6666667);
    expect(formatPace(paceFromSpeed(4))).toBe('4:10');
    for(const value of [0,-1,NaN,Infinity,undefined,null,'4'])expect(paceFromSpeed(value)).toBeNull();
    expect(formatPace(null)).toBe('—');
    expect(formatPace(4.999)).toBe('5:00');
  });
  it('orders real timestamps and preserves missing values, sea-level altitude and paused power',()=>{
    const points=analysisPoints({start_time:'2026-10-01T08:00:00Z',sport_type:'running',records:[
      {timestamp:'2026-10-01T08:00:20Z',speed:0,heart_rate:0,altitude:-5,power:0,cadence:0},
      {timestamp:'invalid',speed:3},
      {timestamp:'2026-10-01T08:00:10Z',speed:3,enhanced_speed:4,heart_rate:140,altitude:0,enhanced_altitude:2},
      {timestamp:'2026-10-01T08:00:30Z'},
    ]});
    expect(points.map(p=>p.elapsed)).toEqual([10,20,30]);
    expect(points[0].pace).toBeCloseTo(4.1666667);
    expect(points[0].altitude).toBe(2);
    expect(points[1]).toMatchObject({pace:null,heart_rate:null,altitude:-5,power:0,cadence:0});
    expect(points[2]).toMatchObject({pace:null,heart_rate:null,altitude:null,power:null,cadence:null});
    expect(nearestPoint(points,18)).toBe(1);
    expect(nearestPoint(points,0)).toBe(0);
    expect(nearestPoint(points,100)).toBe(2);
    expect(nearestPoint([],10)).toBeNull();
  });
  it('uses a valid first timestamp if a start time is missing and formats long workouts',()=>{
    const points=analysisPoints({start_time:'',sport_type:'swimming',records:[{timestamp:'2026-10-01T08:00:00Z',speed:1}]});
    expect(points[0].elapsed).toBe(0);
    expect(formatPace(points[0].pace)).toBe('1:40');
    expect(formatElapsed(3665)).toBe('1:01:05');
  });
});

describe('GPS route validation',()=>{
  it('keeps real zero coordinates and splits gaps instead of drawing through missing GPS samples',()=>{
    expect(gpsSegments([
      {position_lat:0,position_long:0},{position_lat:1,position_long:2},
      {position_lat:null,position_long:2},{position_lat:48,position_long:2},
      {position_lat:95,position_long:2},{position_lat:48,position_long:Infinity},
    ])).toEqual([[[0,0],[1,2]],[[48,2]]]);
    expect(gpsSegments([{}, {position_lat:'48',position_long:2}])).toEqual([]);
  });
});
