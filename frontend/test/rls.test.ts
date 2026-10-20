import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
const db=new PGlite();
const userA='11111111-1111-4111-8111-111111111111',userB='22222222-2222-4222-8222-222222222222';
const hash='a'.repeat(64);
beforeAll(async()=>{
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${userA}'),('${userB}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id int generated always as identity primary key,bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
    grant usage,select on sequence storage.objects_id_seq to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    -- Simulate an existing overly broad policy from another app.
    create policy existing_policy on storage.objects for all to public using(true) with check(true);
  `);
  const migration=readFileSync(new URL('../../supabase/migrations/202610200001_sport_cloud.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec(migration); // repeatable setup
  const leases=readFileSync(new URL('../../supabase/migrations/202610200002_garmin_leases.sql',import.meta.url),'utf8');
  await db.exec(leases);await db.exec(leases);
  await db.exec(`
    insert into public.sport_activities(owner_id,id,start_time,summary) values
    ('${userA}','${hash}',now(),'${JSON.stringify({id:hash,title:'Private A'})}'),
    ('${userB}','${hash}',now(),'${JSON.stringify({id:hash,title:'Private B'})}');
    insert into storage.objects(bucket_id,name) values('sport-files','${userA}/${hash}/original.fit'),('sport-files','${userB}/${hash}/original.fit');
    insert into public.sport_sync_status(owner_id,message) values('${userA}','A'),('${userB}','B');
  `);
},30000);
afterAll(()=>db.close());
async function asUser(role:string,id=''){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec(`set role ${role}`);
}
it('each signed-in account only sees its own activities, status and FITs',async()=>{
  await asUser('authenticated',userA);
  const {rows}=await db.query<{owner_id:string}>('select owner_id from public.sport_activities');
  expect(rows.map(r=>r.owner_id)).toEqual([userA]);
  expect((await db.query('select * from public.sport_sync_status')).rows).toHaveLength(1);
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
  await asUser('authenticated',userB);
  expect((await db.query<{owner_id:string}>('select owner_id from public.sport_activities')).rows[0].owner_id).toBe(userB);
});
it('prevents cross-account activity writes and FIT overwrites',async()=>{
  await asUser('authenticated',userA);
  await expect(db.exec(`insert into public.sport_activities values('${userB}','${'b'.repeat(64)}',now(),'${JSON.stringify({id:'b'.repeat(64)})}',now())`)).rejects.toThrow(/row-level security/);
  await expect(db.exec(`insert into storage.objects(bucket_id,name) values('sport-files','${userB}/new.fit')`)).rejects.toThrow(/row-level security/);
  const updated=await db.query(`update storage.objects set name='stolen' where name like '${userB}/%' returning *`);
  expect(updated.rows).toHaveLength(0);
});
it('blocks anonymous access and denies Garmin sessions even to signed-in users',async()=>{
  await asUser('anon');
  await expect(db.query('select * from public.sport_activities')).rejects.toThrow(/permission denied/);
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  for(const role of ['anon','authenticated']){
    await asUser(role,userA);
    await expect(db.query('select * from sport_private.garmin_sessions')).rejects.toThrow(/permission denied/);
    await expect(db.query('select public.sport_load_garmin_session($1)',[userA])).rejects.toThrow(/permission denied/);
    await expect(db.query('select public.sport_save_garmin_session($1,$2)',[userA,'secret'])).rejects.toThrow(/permission denied/);
  }
});
it('allows only the server role to save and refresh Garmin sessions',async()=>{
  await asUser('service_role');
  await db.query('select public.sport_save_garmin_session($1,$2)',[userA,'session-v1']);
  await db.query('select public.sport_save_garmin_session($1,$2)',[userA,'session-v2']);
  expect((await db.query<{sport_load_garmin_session:string}>('select public.sport_load_garmin_session($1)',[userA])).rows[0].sport_load_garmin_session).toBe('session-v2');
});

it('serializes server login and sync without giving browser users lease access',async()=>{
  const first='33333333-3333-4333-8333-333333333333',second='44444444-4444-4444-8444-444444444444';
  await asUser('authenticated',userA);
  await expect(db.query('select public.sport_acquire_garmin_lease($1,$2,300)',[userA,first])).rejects.toThrow(/permission denied/);
  await asUser('service_role');
  const acquire=async(id:string)=>(await db.query<{ok:boolean}>('select public.sport_acquire_garmin_lease($1,$2,300) as ok',[userA,id])).rows[0].ok;
  expect(await acquire(first)).toBe(true);expect(await acquire(second)).toBe(false);
  await db.query('select public.sport_release_garmin_lease($1,$2)',[userA,second]);
  expect(await acquire(second)).toBe(false);
  await db.query('select public.sport_release_garmin_lease($1,$2)',[userA,first]);
  expect(await acquire(second)).toBe(true);
});
