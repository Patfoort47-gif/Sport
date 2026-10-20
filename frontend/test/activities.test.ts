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
    expect(detail.laps[0].total_distance).toBe(1000);
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
