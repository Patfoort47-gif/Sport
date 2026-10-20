import {expect,it,vi} from 'vitest';
import {historyProgress,shortDuration} from '../src/garminProgress';

it('estimates historical progress from the oldest Garmin activity reached',()=>{
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  const result=historyProgress('2024-01-01','2025-01-01',120);
  expect(result.percent).toBe(50);
  expect(result.remainingSeconds).toBe(120);
  expect(shortDuration(result.remainingSeconds)).toBe('environ 2 min');
  vi.useRealTimers();
});

it('reports completion and handles an unknown cursor',()=>{
  expect(historyProgress('2018-01-01',null,0).remainingSeconds).toBeNull();
  expect(historyProgress('2018-01-01','2019-01-01',10,true)).toEqual({percent:100,remainingSeconds:0});
});
