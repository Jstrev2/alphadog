-- Walker reports: where a dog went, messes, busy spots, and missing map spots.
-- Raw rows are private to the person who made them. The public map only sees
-- recent reports grouped into ~11 m buckets through report_heat(), with no user ids.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pee', 'poop', 'mess', 'busy', 'hydrant', 'bag_station', 'trash_can')),
  lon double precision not null check (lon between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  created_at timestamptz not null default now()
);

create index reports_user_created_idx on public.reports (user_id, created_at desc);
create index reports_lat_lon_idx on public.reports (lat, lon);

alter table public.reports enable row level security;

create policy "Users add their own reports"
  on public.reports for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users see their own reports"
  on public.reports for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users delete their own reports"
  on public.reports for delete to authenticated
  using (user_id = (select auth.uid()));

-- Supabase's default privileges still hand out truncate/references/trigger,
-- so take everything back and grant only what the policies above cover.
revoke all on public.reports from anon;
revoke truncate, references, trigger, update on public.reports from authenticated;
grant select, insert, delete on public.reports to authenticated;

-- At most 30 reports per person per hour.
create function public.reports_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reports
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many reports in the last hour. Try again later.';
  end if;
  return new;
end;
$$;

revoke execute on function public.reports_rate_limit() from public, anon, authenticated;

create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.reports_rate_limit();

-- Public map data: recent reports inside a box (max 0.5 degrees a side),
-- grouped into ~11 m buckets, with counts and no user ids.
create function public.report_heat(
  min_lon double precision, min_lat double precision,
  max_lon double precision, max_lat double precision
) returns table (lon double precision, lat double precision, kind text, n bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select round(r.lon::numeric, 4)::double precision,
         round(r.lat::numeric, 4)::double precision,
         r.kind,
         count(*),
         max(r.created_at)
  from public.reports r
  where max_lon - min_lon <= 0.5
    and max_lat - min_lat <= 0.5
    and r.lon between min_lon and max_lon
    and r.lat between min_lat and max_lat
    and r.created_at > now() - case r.kind
      when 'busy' then interval '2 hours'
      when 'mess' then interval '7 days'
      when 'pee' then interval '30 days'
      when 'poop' then interval '30 days'
      else interval '365 days'
    end
  group by 1, 2, 3
  limit 5000;
$$;

revoke execute on function public.report_heat(double precision, double precision, double precision, double precision) from public;
grant execute on function public.report_heat(double precision, double precision, double precision, double precision) to anon, authenticated;
