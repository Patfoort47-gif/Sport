import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {deleteDB} from 'idb';
import {decodeFit} from '../src/fit';
import {getActivity, importFiles, listActivities} from '../src/activities';
import {fitFixture} from './fixture';
const arrayBuffer=(bytes:Uint8Array)=>Uint8Array.from(bytes).buffer;
beforeEach(async()=>{await deleteDB('triathlon-local')});
describe('FIT browser workflow',()=>{
  it.each([
    [['running'],'running'], [['cycling'],'cycling'],
    [['swimming','transition','cycling','transition','running'],'multisport'],
  ])('decodes %j',async(sports, expected)=>{
    const detail=await decodeFit(arrayBuffer(fitFixture(sports as string[])));
    expect(detail.sport_type).toBe(expected);
    expect(detail.distance_meters).toBe(1000*sports.length);
    expect(detail.duration_seconds).toBe(600*sports.length);
    expect(detail.start_time).toBe('2026-10-01T08:00:00.000Z');
    expect(detail.avg_heart_rate).toBe(140);
    expect(detail.records).toHaveLength(10);
    expect(detail.records[0].position_lat).toBeCloseTo(48,5);
    expect(detail.records[0].position_long).toBeCloseTo(2,5);
    expect(detail.records[0].speed).toBe(3.5);
    expect(detail.records[0].power).toBe(200);
    expect(detail.records[0].cadence).toBe(85);
    expect(detail.records[0].altitude).toBe(150);
    expect(detail.records[9].altitude).toBe(159);
    expect(detail.records[0].temperature).toBe(18);
    expect(detail.records[0].timestamp).toBe('2026-10-01T08:00:00.000Z');
    expect(detail.laps[0].total_distance).toBe(1000);
  });
  it('keeps missing GPS and physiological fields absent for indoor sessions',async()=>{
    const detail=await decodeFit(arrayBuffer(fitFixture(['running'],{sensors:false})));
    expect(detail.avg_heart_rate).toBeNull();
    expect(detail.records).toHaveLength(10);
    for(const record of detail.records){
      expect(record.heart_rate).toBeUndefined();
      expect(record.position_lat).toBeUndefined();
      expect(record.position_long).toBeUndefined();
      expect(record.speed).toBeUndefined();
      expect(record.altitude).toBeUndefined();
    }
  });
  it('rejects truncated FIT files and invalid headers before decoding',async()=>{
    const raw=fitFixture();
    await expect(decodeFit(arrayBuffer(raw.slice(0,-1)))).rejects.toThrow(/invalide|CRC/);
    const broken=Uint8Array.from(raw);broken[8]=0;
    await expect(decodeFit(arrayBuffer(broken))).rejects.toThrow(/invalide|CRC/);
  });
  it('preserves every multisport transition session',async()=>{
    const detail=await decodeFit(arrayBuffer(fitFixture(['swimming','transition','cycling','transition','running'])));
    expect(detail.sessions.map(s=>s.sport)).toEqual(['swimming','transition','cycling','transition','running']);
    expect(detail.sessions[1].total_timer_time).toBe(600);
    expect(detail.sessions[3].start_time).toBe('2026-10-01T08:30:00.000Z');
  });
  it('persists details, FIT originals and summaries and deduplicates the same file',async()=>{
    const file=new File([arrayBuffer(fitFixture())],'run.fit');
    expect((await importFiles([file]))[0].status).toBe('imported');
    const activities=await listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]).not.toHaveProperty('records');
    expect((await getActivity(activities[0].id)).records).toHaveLength(10);
    expect((await importFiles([file]))[0].status).toBe('duplicate');
    expect(await listActivities()).toHaveLength(1);
  });
  it('rejects corrupt data and continues importing other batch files',async()=>{
    const corrupt=fitFixture();corrupt[corrupt.length-1]^=1;
    const results=await importFiles([
      new File(['invalid'],'invalid.fit'), new File([arrayBuffer(corrupt)],'corrupt.fit'),
      new File([arrayBuffer(fitFixture())],'valid.fit'),
    ]);
    expect(results[0].error).toBeTruthy();expect(results[1].error).toContain('CRC');
    expect(results[2].status).toBe('imported');expect(await listActivities()).toHaveLength(1);
  });
  it('rejects session-less files',async()=>{
    await expect(decodeFit(arrayBuffer(fitFixture([])))).rejects.toThrow('session');
  });
  it('handles missing activity and oversized file',async()=>{
    await expect(getActivity('missing')).rejects.toThrow('introuvable');
    const file=new File([],'large.fit');Object.defineProperty(file,'size',{value:33*1024*1024});
    expect((await importFiles([file]))[0].error).toContain('32 Mo');
  });
});
