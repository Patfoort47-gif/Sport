begin;
create table if not exists public.sport_activities (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[a-f0-9]{64}$'),
  start_time timestamptz not null,
  summary jsonb not null check (summary->>'id' = id),
  created_at timestamptz not null default now(),
  primary key (owner_id,id)
);
create index if not exists sport_activities_date on public.sport_activities(owner_id,start_time desc);
alter table public.sport_activities enable row level security;
revoke all on public.sport_activities from public,anon;
grant select,insert,update,delete on public.sport_activities to authenticated;
grant all on public.sport_activities to service_role;
drop policy if exists sport_activities_owner on public.sport_activities;
create policy sport_activities_owner on public.sport_activities for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create table if not exists public.sport_garmin_imports (
  owner_id uuid not null references auth.users(id) on delete cascade,
  garmin_id text not null,
  imported_at timestamptz not null default now(),
  primary key(owner_id,garmin_id)
);
alter table public.sport_garmin_imports enable row level security;
revoke all on public.sport_garmin_imports from anon,authenticated;
grant select on public.sport_garmin_imports to authenticated;
grant all on public.sport_garmin_imports to service_role;
drop policy if exists sport_garmin_imports_owner on public.sport_garmin_imports;
create policy sport_garmin_imports_owner on public.sport_garmin_imports for select to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.sport_sync_status (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  last_attempt timestamptz,
  last_success timestamptz,
  message text not null default ''
);
alter table public.sport_sync_status enable row level security;
revoke all on public.sport_sync_status from anon,authenticated;
grant select on public.sport_sync_status to authenticated;
grant all on public.sport_sync_status to service_role;
drop policy if exists sport_sync_status_owner on public.sport_sync_status;
create policy sport_sync_status_owner on public.sport_sync_status for select to authenticated using ((select auth.uid()) = owner_id);

-- This schema must NOT be added to Supabase's exposed schemas.
create schema if not exists sport_private;
revoke all on schema sport_private from public,anon,authenticated;
create table if not exists sport_private.garmin_sessions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  session_data text not null,
  updated_at timestamptz not null default now()
);
alter table sport_private.garmin_sessions enable row level security;
revoke all on sport_private.garmin_sessions from public,anon,authenticated;

create or replace function public.sport_load_garmin_session(p_owner_id uuid)
returns text language sql security definer set search_path = '' as $$
  select session_data from sport_private.garmin_sessions where owner_id = p_owner_id;
$$;
create or replace function public.sport_save_garmin_session(p_owner_id uuid,p_session text)
returns void language sql security definer set search_path = '' as $$
  insert into sport_private.garmin_sessions(owner_id,session_data) values(p_owner_id,p_session)
  on conflict(owner_id) do update set session_data=excluded.session_data,updated_at=now();
$$;
revoke all on function public.sport_load_garmin_session(uuid) from public,anon,authenticated;
revoke all on function public.sport_save_garmin_session(uuid,text) from public,anon,authenticated;
grant execute on function public.sport_load_garmin_session(uuid) to service_role;
grant execute on function public.sport_save_garmin_session(uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('sport-files','sport-files',false,33554432,array['application/octet-stream','application/json'])
on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='sport-files' and public=true) then
    raise exception 'sport-files must be a private bucket';
  end if;
end $$;
-- A restrictive boundary also protects this bucket if the project already has
-- a broad permissive Storage policy for other applications.
drop policy if exists sport_files_boundary on storage.objects;
create policy sport_files_boundary on storage.objects as restrictive for all to public
using (bucket_id <> 'sport-files' or (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id <> 'sport-files' or (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists sport_files_owner_select on storage.objects;
drop policy if exists sport_files_owner_insert on storage.objects;
drop policy if exists sport_files_owner_update on storage.objects;
drop policy if exists sport_files_owner_delete on storage.objects;
create policy sport_files_owner_select on storage.objects for select to authenticated
using (bucket_id='sport-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy sport_files_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='sport-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy sport_files_owner_update on storage.objects for update to authenticated
using (bucket_id='sport-files' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='sport-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy sport_files_owner_delete on storage.objects for delete to authenticated
using (bucket_id='sport-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
