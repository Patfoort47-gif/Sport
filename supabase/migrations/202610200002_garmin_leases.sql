begin;
create table if not exists sport_private.garmin_leases (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  lease_id uuid not null,
  expires_at timestamptz not null
);
alter table sport_private.garmin_leases enable row level security;
revoke all on sport_private.garmin_leases from public,anon,authenticated;
create or replace function public.sport_acquire_garmin_lease(p_owner_id uuid,p_lease_id uuid,p_seconds int default 2700)
returns boolean language sql security definer set search_path='' as $$
  with acquired as (
    insert into sport_private.garmin_leases(owner_id,lease_id,expires_at)
    values(p_owner_id,p_lease_id,now()+make_interval(secs=>greatest(1,least(p_seconds,2700))))
    on conflict(owner_id) do update set lease_id=excluded.lease_id,expires_at=excluded.expires_at
    where sport_private.garmin_leases.expires_at < now()
    returning true
  ) select exists(select 1 from acquired);
$$;
create or replace function public.sport_release_garmin_lease(p_owner_id uuid,p_lease_id uuid)
returns void language sql security definer set search_path='' as $$
  delete from sport_private.garmin_leases where owner_id=p_owner_id and lease_id=p_lease_id;
$$;
revoke all on function public.sport_acquire_garmin_lease(uuid,uuid,int) from public,anon,authenticated;
revoke all on function public.sport_release_garmin_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sport_acquire_garmin_lease(uuid,uuid,int) to service_role;
grant execute on function public.sport_release_garmin_lease(uuid,uuid) to service_role;
commit;
