-- AlphaDog turf game: dogs, marks, hidden zones, woofs, badges and leaderboards.
--
-- Privacy rules this file enforces (see docs/PRODUCT.md):
--   * Raw marks are private to the person who made them. Nobody else ever
--     sees a mark's location, only who holds each block.
--   * The turf board is computed as of the top of the hour, never live.
--   * A block won by a dog whose owner's hidden zone covers it shows as
--     "local" to everyone but that owner. The app saves the zone's blocks,
--     never the home spot.
--   * Owner accounts are never exposed. Dogs are the public face.
--   * Ghost dogs never show on the turf board, leaderboards or woofs.
--   * The heat map only shows a spot once 3 different people have marked it.
--
-- Turf blocks and 25 m "spots" use Chicago's address grid. Keep the numbers in
-- grid_tile/grid_spot in sync with src/lib/grid.ts.

-- ---------- grid helpers ----------

create function public.grid_tile(lon double precision, lat double precision) returns text
language sql immutable parallel safe set search_path = '' as $$
  select floor((lon + 87.63108) / 0.002413 + 0.5)::bigint::text || ','
      || floor((lat - 41.88094) / 0.001833 + 0.5)::bigint::text
$$;

-- An eighth of a block on each side, about 25 m.
create function public.grid_spot(lon double precision, lat double precision) returns text
language sql immutable parallel safe set search_path = '' as $$
  select floor((lon + 87.63108) / (0.002413 / 8))::bigint::text || ','
      || floor((lat - 41.88094) / (0.001833 / 8))::bigint::text
$$;

create function public.grid_meters(
  lon1 double precision, lat1 double precision, lon2 double precision, lat2 double precision
) returns double precision
language sql immutable parallel safe set search_path = '' as $$
  select sqrt(power((lon2 - lon1) * 111320 * cos(radians((lat1 + lat2) / 2)), 2) + power((lat2 - lat1) * 110574, 2))
$$;

create function public.chicago_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Chicago')::date
$$;

revoke execute on function public.grid_tile(double precision, double precision) from public, anon, authenticated;
revoke execute on function public.grid_spot(double precision, double precision) from public, anon, authenticated;
revoke execute on function public.grid_meters(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.chicago_today() from public, anon, authenticated;

-- ---------- OpenStreetMap spots (baseline data, kept apart from user data) ----------

create table public.osm_spots (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('hydrant', 'post', 'dog_park', 'waste_station')),
  lon double precision not null,
  lat double precision not null,
  name text
);
create index osm_spots_lat_lon_idx on public.osm_spots (lat, lon);
alter table public.osm_spots enable row level security;
-- No policies: only the functions below read it.
revoke all on public.osm_spots from anon, authenticated;

-- ---------- dogs ----------

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  size text not null check (size in ('toy', 'small', 'medium', 'large', 'giant')),
  breed text check (breed is null or char_length(breed) <= 40),
  bio text check (bio is null or char_length(bio) <= 160),
  photo_path text check (photo_path is null or char_length(photo_path) <= 200),
  ghost boolean not null default false,
  created_at timestamptz not null default now()
);
create index dogs_owner_idx on public.dogs (owner_id);

alter table public.dogs enable row level security;
create policy "Owners see their dogs" on public.dogs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners add dogs" on public.dogs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners edit their dogs" on public.dogs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners remove their dogs" on public.dogs for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.dogs from anon;
revoke truncate, references, trigger on public.dogs from authenticated;
grant select, insert, update, delete on public.dogs to authenticated;

create function public.dogs_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.dogs where owner_id = new.owner_id) >= 4 then
    raise exception 'You can have up to 4 dogs.';
  end if;
  return new;
end;
$$;
revoke execute on function public.dogs_limit() from public, anon, authenticated;
create trigger dogs_limit before insert on public.dogs for each row execute function public.dogs_limit();

-- ---------- hidden zones ----------

-- A few turf blocks around home, chosen by the app. Never the home spot itself.
create table public.home_zones (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  tiles text[] not null check (
    cardinality(tiles) between 1 and 9
    and array_to_string(tiles, ' ') ~ '^-?\d{1,6},-?\d{1,6}( -?\d{1,6},-?\d{1,6})*$'
  ),
  updated_at timestamptz not null default now()
);

alter table public.home_zones enable row level security;
create policy "Owners see their zone" on public.home_zones for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners set their zone" on public.home_zones for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners change their zone" on public.home_zones for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners clear their zone" on public.home_zones for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.home_zones from anon;
revoke truncate, references, trigger on public.home_zones from authenticated;
grant select, insert, update, delete on public.home_zones to authenticated;

-- ---------- marks ----------

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lon double precision not null,
  lat double precision not null,
  accuracy_m real not null check (accuracy_m >= 0),
  -- Everything below is filled in by marks_before_insert.
  tile text not null default '',
  spot text not null default '',
  local_day date not null default '2000-01-01',
  -- First time this dog marked this spot today, so it earns a point.
  fresh boolean not null default false,
  -- First dog ever to mark this block.
  first_in_tile boolean not null default false,
  -- Hydrant, post or dog park within a few meters.
  near text,
  created_at timestamptz not null default now()
);
create index marks_dog_created_idx on public.marks (dog_id, created_at desc);
create index marks_owner_created_idx on public.marks (owner_id, created_at desc);
create index marks_tile_created_idx on public.marks (tile, created_at);
create index marks_spot_idx on public.marks (spot, created_at);
create index marks_day_idx on public.marks (local_day);

alter table public.marks enable row level security;
create policy "Owners add marks" on public.marks for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners see their marks" on public.marks for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners undo their marks" on public.marks for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.marks from anon;
revoke truncate, references, trigger, update on public.marks from authenticated;
grant select, insert, delete on public.marks to authenticated;

create function public.marks_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prev_lon double precision;
  prev_lat double precision;
  prev_at timestamptz;
  meters double precision;
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;
  new.owner_id := uid;
  new.created_at := now();

  if not exists (select 1 from public.dogs d where d.id = new.dog_id and d.owner_id = uid) then
    raise exception 'That dog is not yours.';
  end if;
  -- Andersonville pilot box. Keep in sync with src/lib/areas.ts.
  if new.lon not between -87.68 and -87.64 or new.lat not between 41.966 and 41.991 then
    raise exception 'Marks only count inside the pilot area.';
  end if;
  if new.accuracy_m > 100 then
    raise exception 'Location is not precise enough.';
  end if;
  if (select count(*) from public.marks m where m.owner_id = uid and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many marks in the last hour.';
  end if;

  -- Dogs walk. A mark far from the last one, too soon after it, is a car or a cheat.
  select m.lon, m.lat, m.created_at into prev_lon, prev_lat, prev_at
  from public.marks m where m.dog_id = new.dog_id order by m.created_at desc limit 1;
  if prev_at is not null then
    meters := public.grid_meters(prev_lon, prev_lat, new.lon, new.lat);
    if meters > 60 and meters / greatest(extract(epoch from now() - prev_at), 1) > 8 then
      raise exception 'Too fast for a walk.';
    end if;
  end if;

  new.tile := public.grid_tile(new.lon, new.lat);
  new.spot := public.grid_spot(new.lon, new.lat);
  new.local_day := public.chicago_today();
  new.fresh := not exists (
    select 1 from public.marks m
    where m.dog_id = new.dog_id and m.spot = new.spot and m.local_day = new.local_day
  );
  new.first_in_tile := not exists (select 1 from public.marks m where m.tile = new.tile);

  -- Hydrants come from OpenStreetMap plus walker reports that 2 or more people agree on.
  new.near := (
    select k from (
      select s.kind as k, case s.kind when 'hydrant' then 1 when 'dog_park' then 2 else 3 end as pri
      from public.osm_spots s
      where s.lat between new.lat - 0.001 and new.lat + 0.001
        and s.lon between new.lon - 0.001 and new.lon + 0.001
        and public.grid_meters(s.lon, s.lat, new.lon, new.lat)
            <= case s.kind when 'dog_park' then 60 when 'hydrant' then 10 else 6 end
      union all
      select 'hydrant', 1
      from public.reports r
      where r.kind = 'hydrant'
        and r.lat between new.lat - 0.0002 and new.lat + 0.0002
        and r.lon between new.lon - 0.0003 and new.lon + 0.0003
        and public.grid_meters(r.lon, r.lat, new.lon, new.lat) <= 10
      group by round(r.lon::numeric, 4), round(r.lat::numeric, 4)
      having count(distinct r.user_id) >= 2
    ) n
    where k in ('hydrant', 'dog_park', 'post')
    order by pri
    limit 1
  );
  return new;
end;
$$;
revoke execute on function public.marks_before_insert() from public, anon, authenticated;
create trigger marks_before_insert before insert on public.marks
  for each row execute function public.marks_before_insert();

-- ---------- woofs ----------

create table public.woofs (
  from_dog uuid not null references public.dogs (id) on delete cascade,
  to_dog uuid not null references public.dogs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_dog, to_dog),
  check (from_dog <> to_dog)
);
create index woofs_to_idx on public.woofs (to_dog, created_at desc);
alter table public.woofs enable row level security;
-- No policies: woof() and my_woofs() below are the only way in.
revoke all on public.woofs from anon, authenticated;

-- ---------- turf ----------

-- Who holds each block, counting marks in the 7 days before t.
-- Points on a block = different spots marked there, each spot once per day.
-- Ties go to the local dog, then to whoever got there first.
create function public.turf_at(t timestamptz)
returns table (tile text, dog_id uuid, owner_id uuid, points int, is_local boolean)
language sql stable security definer set search_path = '' as $$
  with pts as (
    select m.tile, m.dog_id, m.owner_id,
           count(distinct (m.spot, m.local_day))::int as points,
           max(m.created_at) as last_at
    from public.marks m
    join public.dogs d on d.id = m.dog_id
    where not d.ghost and m.created_at >= t - interval '7 days' and m.created_at < t
    group by m.tile, m.dog_id, m.owner_id
  ), ranked as (
    select p.*, (z.owner_id is not null) as is_local,
           row_number() over (
             partition by p.tile
             order by p.points desc, (z.owner_id is not null) desc, p.last_at asc
           ) as rn
    from pts p
    left join public.home_zones z on z.owner_id = p.owner_id and p.tile = any (z.tiles)
  )
  select r.tile, r.dog_id, r.owner_id, r.points, r.is_local from ranked r where r.rn = 1
$$;
revoke execute on function public.turf_at(timestamptz) from public, anon, authenticated;

create function public.board_time() returns timestamptz
language sql stable set search_path = '' as $$ select date_trunc('hour', now()) $$;
revoke execute on function public.board_time() from public, anon, authenticated;

-- Public turf map: each held block as 'mine', 'taken' or 'local'. No dog ids.
create function public.turf_board()
returns table (tile text, state text, points int)
language sql stable security definer set search_path = '' as $$
  select b.tile,
         case when b.owner_id = auth.uid() then 'mine' when b.is_local then 'local' else 'taken' end,
         b.points
  from public.turf_at(public.board_time()) b
$$;
revoke execute on function public.turf_board() from public;
grant execute on function public.turf_board() to anon, authenticated;

create function public.dog_json(d public.dogs) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'name', d.name, 'size', d.size, 'breed', d.breed, 'photo_path', d.photo_path)
$$;
revoke execute on function public.dog_json(public.dogs) from public, anon, authenticated;

-- One block, when someone taps it. The holder shows only if they are not local.
create function public.tile_detail(p_tile text, p_dog uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with b as (select * from public.turf_at(public.board_time()) t where t.tile = p_tile)
  select jsonb_build_object(
    'tile', p_tile,
    'as_of', public.board_time(),
    'state', case
      when b.dog_id is null then 'open'
      when b.owner_id = auth.uid() then 'mine'
      when b.is_local then 'local'
      else 'taken' end,
    'leader_points', coalesce(b.points, 0),
    'holder', case when b.dog_id is not null and (b.owner_id = auth.uid() or not b.is_local)
      then (select public.dog_json(d) from public.dogs d where d.id = b.dog_id) end,
    'my_points', (
      select count(distinct (m.spot, m.local_day))::int from public.marks m
      where m.dog_id = p_dog and m.owner_id = auth.uid() and m.tile = p_tile
        and m.created_at >= now() - interval '7 days'
    )
  )
  from (select 1) one left join b on true
$$;
revoke execute on function public.tile_detail(text, uuid) from public;
grant execute on function public.tile_detail(text, uuid) to anon, authenticated;

-- ---------- leaderboards ----------

create function public.period_start(p_period text) returns date
language sql stable set search_path = '' as $$
  select case p_period
    when 'day' then public.chicago_today()
    when 'week' then date_trunc('week', public.chicago_today())::date
    when 'month' then date_trunc('month', public.chicago_today())::date
  end
$$;
revoke execute on function public.period_start(text) from public, anon, authenticated;

-- Points this day, week or month, with blocks held right now. Ghost dogs sit out.
create function public.leaderboard(p_period text, p_size text default null)
returns table (rank int, dog_id uuid, name text, size text, breed text, photo_path text, points int, blocks int)
language sql stable security definer set search_path = '' as $$
  with pts as (
    select m.dog_id, count(distinct (m.spot, m.local_day))::int as points
    from public.marks m
    where m.local_day >= public.period_start(p_period)
    group by m.dog_id
  ), held as (
    select b.dog_id, count(*)::int as blocks from public.turf_at(public.board_time()) b group by b.dog_id
  )
  select (rank() over (order by p.points desc))::int, d.id, d.name, d.size, d.breed, d.photo_path,
         p.points, coalesce(h.blocks, 0)
  from pts p
  join public.dogs d on d.id = p.dog_id
  left join held h on h.dog_id = d.id
  where not d.ghost and (p_size is null or d.size = p_size)
  order by 1, d.name
  limit 50
$$;
revoke execute on function public.leaderboard(text, text) from public;
grant execute on function public.leaderboard(text, text) to anon, authenticated;

-- ---------- badges ----------

create function public.dog_streak(p_dog uuid) returns int
language sql stable set search_path = '' as $$
  with days as (select distinct m.local_day as d from public.marks m where m.dog_id = p_dog),
  runs as (
    select max(d) as last_day, count(*)::int as len
    from (select d, d - (row_number() over (order by d))::int as grp from days) g
    group by grp
  )
  select coalesce((select len from runs where last_day >= public.chicago_today() - 1 order by last_day desc limit 1), 0)
$$;
revoke execute on function public.dog_streak(uuid) from public, anon, authenticated;

-- Badge key -> how many times earned. Only earned badges are listed.
create function public.dog_badges(p_dog uuid) returns jsonb
language sql stable set search_path = '' as $$
  with m as (
    select * from public.marks where dog_id = p_dog
  ), runs as (
    select count(*)::int as len
    from (select d, d - (row_number() over (order by d))::int as grp
          from (select distinct local_day as d from m) days) g
    group by grp
  ), daily as (
    -- Completed days, weeks and months, with each dog's points. Ghosts sit out.
    select p.period, p.start_day, x.dog_id, count(distinct (x.spot, x.local_day)) as pts
    from public.marks x
    join public.dogs d on d.id = x.dog_id and not d.ghost
    cross join lateral (values
      ('alpha_day', x.local_day),
      ('alpha_week', date_trunc('week', x.local_day)::date),
      ('alpha_month', date_trunc('month', x.local_day)::date)
    ) as p (period, start_day)
    where p.start_day < case p.period
      when 'alpha_day' then public.period_start('day')
      when 'alpha_week' then public.period_start('week')
      else public.period_start('month') end
    group by p.period, p.start_day, x.dog_id
  ), wins as (
    select period, count(*)::int as n
    from (select *, rank() over (partition by period, start_day order by pts desc) as rk from daily) r
    where rk = 1 and dog_id = p_dog
    group by period
  ), counts (badge, n) as (
    select 'first_mark', least(count(*), 1)::int from m
    union all select 'fire', count(*)::int from m where fresh and near = 'hydrant'
    union all select 'tuff', count(*)::int from m where fresh and near = 'post'
    union all select 'park', count(distinct local_day)::int from m where near = 'dog_park'
    union all select 'nomad', count(*)::int from m where first_in_tile
    union all select 'night_owl', count(distinct local_day)::int from m
      where extract(hour from created_at at time zone 'America/Chicago') >= 22
         or extract(hour from created_at at time zone 'America/Chicago') < 4
    union all select 'early_bird', count(distinct local_day)::int from m
      where extract(hour from created_at at time zone 'America/Chicago') between 4 and 5
    union all select 'on_a_roll', coalesce(sum(len / 7), 0)::int from runs
    union all select period, n from wins
  )
  select coalesce(jsonb_object_agg(badge, n) filter (where n > 0), '{}'::jsonb) from counts
$$;
revoke execute on function public.dog_badges(uuid) from public, anon, authenticated;

-- ---------- dog cards ----------

create function public.dog_card(p_dog uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'name', d.name, 'size', d.size, 'breed', d.breed, 'bio', d.bio,
    'photo_path', d.photo_path, 'since', d.created_at, 'ghost', d.ghost,
    'mine', d.owner_id = auth.uid(),
    'points_today', (select count(distinct m.spot)::int from public.marks m
                     where m.dog_id = d.id and m.local_day = public.chicago_today()),
    'points_week', (select count(distinct (m.spot, m.local_day))::int from public.marks m
                    where m.dog_id = d.id and m.local_day >= public.period_start('week')),
    'points_month', (select count(distinct (m.spot, m.local_day))::int from public.marks m
                     where m.dog_id = d.id and m.local_day >= public.period_start('month')),
    'points_total', (select count(distinct (m.spot, m.local_day))::int from public.marks m where m.dog_id = d.id),
    'blocks', (select count(*)::int from public.turf_at(public.board_time()) b where b.dog_id = d.id),
    'streak', public.dog_streak(d.id),
    'woofs', (select count(*)::int from public.woofs w join public.dogs f on f.id = w.from_dog
              where w.to_dog = d.id and not f.ghost),
    'badges', public.dog_badges(d.id),
    'i_woofed', exists (select 1 from public.woofs w join public.dogs mine on mine.id = w.from_dog
                        where w.to_dog = d.id and mine.owner_id = auth.uid())
  )
  from public.dogs d
  where d.id = p_dog and (not d.ghost or d.owner_id = auth.uid())
$$;
revoke execute on function public.dog_card(uuid) from public;
grant execute on function public.dog_card(uuid) to anon, authenticated;

-- ---------- woofs ----------

-- Returns 'woofed', or 'pack' when the other dog already woofed back.
create function public.woof(p_from uuid, p_to uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.dogs where id = p_from and owner_id = auth.uid()) then
    raise exception 'Pick one of your dogs first.';
  end if;
  if exists (select 1 from public.dogs where id = p_from and ghost) then
    raise exception 'Ghost dogs cannot woof.';
  end if;
  if not exists (select 1 from public.dogs where id = p_to and not ghost and owner_id <> auth.uid()) then
    raise exception 'That dog cannot get woofs.';
  end if;
  if (select count(*) from public.woofs w join public.dogs d on d.id = w.from_dog
      where d.owner_id = auth.uid() and w.created_at > now() - interval '1 day') >= 50 then
    raise exception 'That is a lot of woofs for one day.';
  end if;
  insert into public.woofs (from_dog, to_dog) values (p_from, p_to) on conflict do nothing;
  return case when exists (select 1 from public.woofs where from_dog = p_to and to_dog = p_from)
    then 'pack' else 'woofed' end;
end;
$$;
revoke execute on function public.woof(uuid, uuid) from public, anon;
grant execute on function public.woof(uuid, uuid) to authenticated;

-- Woofs your dog got, newest first. pack = you woofed back.
create function public.my_woofs(p_dog uuid)
returns table (dog_id uuid, name text, size text, breed text, photo_path text, woofed_at timestamptz, pack boolean)
language sql stable security definer set search_path = '' as $$
  select f.id, f.name, f.size, f.breed, f.photo_path, w.created_at,
         exists (select 1 from public.woofs back where back.from_dog = p_dog and back.to_dog = f.id)
  from public.woofs w
  join public.dogs f on f.id = w.from_dog
  where w.to_dog = p_dog and not f.ghost
    and exists (select 1 from public.dogs mine where mine.id = p_dog and mine.owner_id = auth.uid())
  order by w.created_at desc
  limit 100
$$;
revoke execute on function public.my_woofs(uuid) from public, anon;
grant execute on function public.my_woofs(uuid) to authenticated;

-- ---------- while you were out ----------

-- Blocks your dog won or lost between p_since and now (board time).
-- change: 'won', 'lost' (someone took it) or 'faded' (no marks for a week).
create function public.turf_changes(p_dog uuid, p_since timestamptz)
returns table (tile text, change text, by_name text, by_local boolean)
language sql stable security definer set search_path = '' as $$
  with t0 as (
    select * from public.turf_at(date_trunc('hour', greatest(p_since, now() - interval '7 days')))
  ), t1 as (
    select * from public.turf_at(public.board_time())
  )
  select coalesce(a.tile, b.tile),
         case when b.dog_id = p_dog then 'won' when b.dog_id is null then 'faded' else 'lost' end,
         case when b.dog_id is not null and b.dog_id <> p_dog and not b.is_local
              then (select d.name from public.dogs d where d.id = b.dog_id) end,
         coalesce(b.dog_id <> p_dog and b.is_local, false)
  from t0 a
  full join t1 b on a.tile = b.tile
  where exists (select 1 from public.dogs mine where mine.id = p_dog and mine.owner_id = auth.uid())
    and (
      (b.dog_id = p_dog and a.dog_id is distinct from p_dog)
      or (a.dog_id = p_dog and b.dog_id is distinct from p_dog)
    )
$$;
revoke execute on function public.turf_changes(uuid, timestamptz) from public, anon;
grant execute on function public.turf_changes(uuid, timestamptz) to authenticated;

-- ---------- heat map ----------

-- Where dogs went in the last 30 days, in 25 m spots, only where 3 or more
-- different people have marked or reported. Counts only, no ids.
create function public.dog_heat(
  min_lon double precision, min_lat double precision,
  max_lon double precision, max_lat double precision
) returns table (lon double precision, lat double precision, n bigint)
language sql stable security definer set search_path = '' as $$
  with pts as (
    select m.spot, m.owner_id as who from public.marks m
    where m.created_at > now() - interval '30 days'
      and m.lon between min_lon and max_lon and m.lat between min_lat and max_lat
    union all
    select public.grid_spot(r.lon, r.lat), r.user_id from public.reports r
    where r.kind in ('pee', 'poop') and r.created_at > now() - interval '30 days'
      and r.lon between min_lon and max_lon and r.lat between min_lat and max_lat
  )
  select -87.63108 + (split_part(spot, ',', 1)::bigint + 0.5) * (0.002413 / 8),
         41.88094 + (split_part(spot, ',', 2)::bigint + 0.5) * (0.001833 / 8),
         count(*)
  from pts
  where max_lon - min_lon <= 0.5 and max_lat - min_lat <= 0.5
  group by spot
  having count(distinct who) >= 3
  limit 5000
$$;
revoke execute on function public.dog_heat(double precision, double precision, double precision, double precision) from public;
grant execute on function public.dog_heat(double precision, double precision, double precision, double precision) to anon, authenticated;

-- Pins for messes, busy spots and missing map spots. Pee and poop no longer
-- come through here: they reach the map only through dog_heat().
create or replace function public.report_heat(
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
    and r.kind not in ('pee', 'poop')
    and r.lon between min_lon and max_lon
    and r.lat between min_lat and max_lat
    and r.created_at > now() - case r.kind
      when 'busy' then interval '2 hours'
      when 'mess' then interval '7 days'
      else interval '365 days'
    end
  group by 1, 2, 3
  limit 5000;
$$;

-- ---------- dog photos ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-photos', 'dog-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Files live at <dog id>/<file name>. Anyone can view a photo by its link
-- (the bucket is public), but only the owner can list, add or remove them.
create policy "Owners list their dog photos" on storage.objects for select to authenticated
  using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] in (
    select id::text from public.dogs where owner_id = (select auth.uid())));
create policy "Owners add dog photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-photos' and (storage.foldername(name))[1] in (
    select id::text from public.dogs where owner_id = (select auth.uid())));
create policy "Owners remove dog photos" on storage.objects for delete to authenticated
  using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] in (
    select id::text from public.dogs where owner_id = (select auth.uid())));
