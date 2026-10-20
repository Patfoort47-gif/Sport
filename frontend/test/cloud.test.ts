import {beforeEach,expect,it,vi} from 'vitest';
const {getClient}=vi.hoisted(()=>({getClient:vi.fn()}));
vi.mock('../src/supabase',()=>({getSupabase:getClient}));
import {cloudContext,cloudSave,cloudList,cloudDetail} from '../src/cloud';
import {listActivities} from '../src/activities';
import type {Detail} from '../src/activities';
const owner='11111111-1111-4111-8111-111111111111';
const activity:Detail={id:'a'.repeat(64),title:'run',sport_type:'running',start_time:'2026-10-01T08:00:00Z',duration_seconds:600,distance_meters:1000,total_elevation_gain:0,avg_heart_rate:140,sessions:[],records:[],laps:[]};
beforeEach(()=>{vi.clearAllMocks()});
it('does not silently fall back to local mode on session errors',async()=>{
  getClient.mockReturnValue({auth:{getSession:async()=>({data:{session:null},error:{message:'expired'}})}});
  await expect(listActivities()).rejects.toThrow('Session Supabase');
});
it('uses authenticated owner and reports cloud failures without returning local data',async()=>{
  const range=vi.fn().mockResolvedValue({data:null,error:{message:'denied'}});
  const query:any={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range};
  const client:any={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},from:vi.fn(()=>query)};
  getClient.mockReturnValue(client);
  const context=await cloudContext();expect(context?.owner).toBe(owner);
  await expect(cloudList(context!)).rejects.toThrow('Supabase');
  expect(query.eq).toHaveBeenCalledWith('owner_id',owner);
});
it('stores originals and details before making the summary visible on other devices',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null});
  const upsert=vi.fn().mockResolvedValue({error:null});
  const query:any={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:async()=>({data:null,error:null}),upsert};
  const context:any={owner,client:{from:()=>query,storage:{from:()=>({upload})}}};
  expect(await cloudSave(context,activity,new ArrayBuffer(1))).toBe(true);
  expect(upload.mock.calls[0][0]).toBe(`${owner}/${activity.id}/original.fit`);
  expect(upload.mock.calls[1][0]).toBe(`${owner}/${activity.id}/detail.json`);
  expect(upsert.mock.calls[0][0].owner_id).toBe(owner);
  expect(upsert.mock.calls[0][0].summary).not.toHaveProperty('records');
  upload.mockResolvedValue({error:{message:'quota'}});upsert.mockClear();
  await expect(cloudSave(context,activity,new ArrayBuffer(1))).rejects.toThrow('Supabase');
  expect(upsert).not.toHaveBeenCalled();
});
it('does not upload duplicate files and disallows arbitrary storage paths',async()=>{
  const upload=vi.fn();
  const query:any={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:async()=>({data:{id:activity.id},error:null})};
  const context:any={owner,client:{from:()=>query,storage:{from:()=>({upload})}}};
  expect(await cloudSave(context,activity,new ArrayBuffer(1))).toBe(false);expect(upload).not.toHaveBeenCalled();
  await expect(cloudDetail(context,'../other-user')).rejects.toThrow('invalide');
});
