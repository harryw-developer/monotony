-- Monotony: schema, security and every money-moving function.
--
-- Identity: each device generates a random secret (kept in localStorage) and
-- sends it with every call. Only its sha256 is stored. The client has no
-- table access at all; every read and write goes through the security-definer
-- functions below, so the public anon key cannot move money on its own.

create schema if not exists private;

-- ───────────────────────────── tables ─────────────────────────────

create table public.games (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  banker_player    uuid,
  deputy_player    uuid,
  status           text not null default 'lobby' check (status in ('lobby','active','paused','ended')),
  starting_balance int  not null default 1500,
  go_amount        int  not null default 200,
  currency         text not null default 'M',
  rules            jsonb not null default '{}'::jsonb,
  free_parking     bigint not null default 0,
  created_at       timestamptz not null default now(),
  last_activity    timestamptz not null default now(),
  ended_at         timestamptz
);

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games(id) on delete cascade,
  device_hash  text not null,
  name         text not null,
  avatar       text not null,
  colour       text not null,
  balance      bigint not null default 0,
  is_banker    boolean not null default false,
  frozen       boolean not null default false,
  locked_until timestamptz,
  lock_message text,
  bankrupt     boolean not null default false,
  kicked       boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  unique (game_id, device_hash)
);

create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  seq          bigserial,
  game_id      uuid not null references public.games(id) on delete cascade,
  from_account text not null check (from_account in ('player','bank','parking')),
  from_player  uuid references public.players(id) on delete set null,
  to_account   text not null check (to_account in ('player','bank','parking')),
  to_player    uuid references public.players(id) on delete set null,
  amount       int not null check (amount > 0),
  type         text not null check (type in ('pay','request','go','deal','admin_transfer','set_balance','reversal','bankrupt','parking')),
  note         text,
  created_by   uuid,
  reversed_by  uuid,
  reverses     uuid,
  created_at   timestamptz not null default now()
);
create index on public.transactions (game_id, seq desc);

create table public.requests (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  kind        text not null default 'request' check (kind in ('request','go')),
  from_player uuid not null references public.players(id) on delete cascade, -- who asks
  to_player   uuid references public.players(id) on delete cascade,          -- who pays (null for GO = the Bank)
  amount      int not null check (amount > 0),
  note        text,
  status      text not null default 'pending' check (status in ('pending','paid','declined','cancelled')),
  created_at  timestamptz not null default now()
);
create index on public.requests (game_id, status);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  target_player uuid references public.players(id) on delete cascade, -- null = everyone
  kind          text not null check (kind in ('lock','broadcast','notice','ended')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index on public.events (game_id, created_at desc);

create table private.attempts (
  ip         text not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index on private.attempts (ip, kind, created_at);

-- Lock everything down: RLS on with no policies, and no table grants.
alter table public.games        enable row level security;
alter table public.players      enable row level security;
alter table public.transactions enable row level security;
alter table public.requests     enable row level security;
alter table public.events       enable row level security;
alter table private.attempts    enable row level security;

revoke all on public.games, public.players, public.transactions, public.requests, public.events from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema private from anon, authenticated, public;

-- ───────────────────────────── helpers ─────────────────────────────

create or replace function private.hash_secret(p_secret text) returns text
language plpgsql immutable as $$
begin
  if p_secret is null or length(p_secret) < 32 or length(p_secret) > 128 then
    raise exception 'Invalid device key';
  end if;
  return encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
end $$;

create or replace function private.client_ip() returns text
language plpgsql stable as $$
declare
  v_headers json;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  return coalesce(
    v_headers->>'cf-connecting-ip',
    split_part(v_headers->>'x-forwarded-for', ',', 1),
    'unknown'
  );
exception when others then
  return 'unknown';
end $$;

-- Raise if this IP has made too many attempts of a kind recently, then log one.
create or replace function private.rate_limit(p_kind text, p_max int, p_window interval) returns void
language plpgsql as $$
declare
  v_ip text := private.client_ip();
begin
  if (select count(*) from private.attempts
      where ip = v_ip and kind = p_kind and created_at > now() - p_window) >= p_max then
    raise exception 'Too many attempts. Wait a few minutes and try again.';
  end if;
  insert into private.attempts (ip, kind) values (v_ip, p_kind);
end $$;

create or replace function private.fmt(p_currency text, p_amount bigint) returns text
language sql immutable as $$
  select case when p_amount < 0 then '−' else '' end
         || p_currency || trim(to_char(abs(p_amount), 'FM999,999,999,999'))
$$;

create or replace function private.clean_name(p_name text) returns text
language plpgsql immutable as $$
declare
  v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if length(v) < 1 then raise exception 'Enter a name'; end if;
  if length(v) > 16 then raise exception 'Names can be up to 16 characters'; end if;
  return v;
end $$;

create or replace function private.check_style(p_avatar text, p_colour text) returns void
language plpgsql immutable as $$
begin
  if p_avatar is null or p_avatar not in ('tophat','car','dog','boat','boot','cat','duck','dino') then
    raise exception 'Pick an avatar';
  end if;
  if p_colour is null or p_colour not in ('red','orange','yellow','green','teal','blue','purple','pink') then
    raise exception 'Pick a colour';
  end if;
end $$;

create or replace function private.check_amount(p_amount bigint) returns void
language plpgsql immutable as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > 9999999 then
    raise exception 'Amounts must be whole numbers from 1 to 9,999,999';
  end if;
end $$;

-- Tell every phone in the game to refresh. Payload carries no game data.
create or replace function private.ping(p_game uuid) returns void
language plpgsql as $$
begin
  update public.games set last_activity = now() where id = p_game;
  begin
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'game-' || p_game::text, false);
  exception when others then
    null; -- realtime unavailable: clients fall back to polling
  end;
end $$;

create or replace function private.notice(p_game uuid, p_target uuid, p_text text, p_extra jsonb default '{}'::jsonb)
returns void language sql as $$
  insert into public.events (game_id, target_player, kind, payload)
  values (p_game, p_target, 'notice', jsonb_build_object('text', p_text) || coalesce(p_extra, '{}'::jsonb));
$$;

create or replace function private.player_name(p_player uuid) returns text
language sql stable as $$
  select name from public.players where id = p_player
$$;

-- Find the caller's seat from their device secret.
create or replace function private.caller(p_game uuid, p_secret text) returns public.players
language plpgsql as $$
declare
  v public.players;
begin
  select * into v from public.players
  where game_id = p_game and device_hash = private.hash_secret(p_secret);
  if not found then raise exception 'You are not in this game'; end if;
  if v.kicked then raise exception 'You were removed from this game'; end if;
  return v;
end $$;

create or replace function private.is_admin(p_game public.games, p_me public.players) returns boolean
language plpgsql stable as $$
begin
  if p_me.id = p_game.banker_player then return true; end if;
  -- A deputy takes over while the Banker has been offline for 45 seconds.
  if p_game.deputy_player is not null and p_me.id = p_game.deputy_player then
    return coalesce((select last_seen < now() - interval '45 seconds'
                     from public.players where id = p_game.banker_player), true);
  end if;
  return false;
end $$;

-- Checks for anything a player does on their own behalf.
create or replace function private.assert_can_act(p_game public.games, p_me public.players) returns void
language plpgsql stable as $$
begin
  if p_game.status = 'lobby'  then raise exception 'The game has not started yet'; end if;
  if p_game.status = 'paused' then raise exception 'The Banker has paused the game'; end if;
  if p_game.status = 'ended'  then raise exception 'This game is over'; end if;
  if p_me.bankrupt then raise exception 'You are bankrupt'; end if;
  if p_me.frozen   then raise exception 'Your account is frozen by the Banker'; end if;
  if p_me.locked_until is not null and p_me.locked_until > now() then
    raise exception 'You are locked by the Banker';
  end if;
end $$;

create or replace function private.game_player(p_game uuid, p_player uuid) returns public.players
language plpgsql as $$
declare
  v public.players;
begin
  select * into v from public.players where id = p_player and game_id = p_game and not kicked;
  if not found then raise exception 'That player is not in this game'; end if;
  return v;
end $$;

-- The single place balances change. Debit and credit happen together.
create or replace function private.move(
  p_game uuid,
  p_from_account text, p_from_player uuid,
  p_to_account text,   p_to_player uuid,
  p_amount bigint, p_type text, p_note text, p_by uuid,
  p_check_funds boolean
) returns uuid
language plpgsql as $$
declare
  v_game public.games;
  v_bal  bigint;
  v_id   uuid;
begin
  perform private.check_amount(p_amount);
  if p_from_account = p_to_account and p_from_player is not distinct from p_to_player then
    raise exception 'Cannot pay yourself';
  end if;

  select * into v_game from public.games where id = p_game for update;

  -- Lock player rows in a fixed order to avoid deadlocks.
  perform 1 from public.players
  where id in (p_from_player, p_to_player) order by id for update;

  if p_from_account = 'player' then
    select balance into v_bal from public.players where id = p_from_player and game_id = p_game;
    if not found then raise exception 'Unknown sender'; end if;
    if p_check_funds and not coalesce((v_game.rules->>'allow_negative')::boolean, false)
       and v_bal < p_amount then
      raise exception 'Not enough money (balance %)', private.fmt(v_game.currency, v_bal);
    end if;
    update public.players set balance = balance - p_amount where id = p_from_player;
  elsif p_from_account = 'parking' then
    if v_game.free_parking < p_amount then raise exception 'Free Parking does not have that much'; end if;
    update public.games set free_parking = free_parking - p_amount where id = p_game;
  end if;

  if p_to_account = 'player' then
    update public.players set balance = balance + p_amount where id = p_to_player and game_id = p_game;
    if not found then raise exception 'Unknown recipient'; end if;
  elsif p_to_account = 'parking' then
    update public.games set free_parking = free_parking + p_amount where id = p_game;
  end if;

  insert into public.transactions
    (game_id, from_account, from_player, to_account, to_player, amount, type, note, created_by)
  values
    (p_game, p_from_account, case when p_from_account = 'player' then p_from_player end,
     p_to_account, case when p_to_account = 'player' then p_to_player end,
     p_amount, p_type, nullif(btrim(coalesce(p_note, '')), ''), p_by)
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.new_code() returns text
language plpgsql as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;
  return v_code;
end $$;

-- ───────────────────────────── public API ─────────────────────────────

create or replace function public.create_game(
  p_secret text, p_name text, p_avatar text, p_colour text, p_settings jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name   text := private.clean_name(p_name);
  v_hash   text := private.hash_secret(p_secret);
  v_start  int  := coalesce((p_settings->>'starting_balance')::int, 1500);
  v_go     int  := coalesce((p_settings->>'go_amount')::int, 200);
  v_cur    text := coalesce(nullif(btrim(p_settings->>'currency'), ''), 'M');
  v_rules  jsonb;
  v_game   uuid;
  v_player uuid;
  v_code   text;
begin
  perform private.check_style(p_avatar, p_colour);
  perform private.rate_limit('create', 20, interval '1 hour');
  if v_start < 0 or v_start > 9999999 then raise exception 'Starting balance must be 0 to 9,999,999'; end if;
  if v_go < 0 or v_go > 9999999 then raise exception 'Pass GO amount must be 0 to 9,999,999'; end if;
  if length(v_cur) > 3 then raise exception 'Currency symbol can be up to 3 characters'; end if;

  v_rules := jsonb_build_object(
    'free_parking',   coalesce((p_settings->'rules'->>'free_parking')::boolean, false),
    'show_balances',  coalesce((p_settings->'rules'->>'show_balances')::boolean, true),
    'allow_requests', coalesce((p_settings->'rules'->>'allow_requests')::boolean, true),
    'allow_negative', coalesce((p_settings->'rules'->>'allow_negative')::boolean, false),
    'auto_go',        coalesce((p_settings->'rules'->>'auto_go')::boolean, false)
  );

  v_code := private.new_code();
  insert into games (code, starting_balance, go_amount, currency, rules)
  values (v_code, v_start, v_go, v_cur, v_rules) returning id into v_game;

  insert into players (game_id, device_hash, name, avatar, colour, is_banker)
  values (v_game, v_hash, v_name, p_avatar, p_colour, true) returning id into v_player;

  update games set banker_player = v_player where id = v_game;
  return jsonb_build_object('game_id', v_game, 'code', v_code, 'player_id', v_player);
end $$;

-- Look up a code before choosing a name, and rejoin an existing seat.
create or replace function public.find_game(p_code text, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_game games;
  v_me   players;
begin
  select * into v_game from games where code = v_code and status <> 'ended';
  if not found then
    perform private.rate_limit('join_fail', 30, interval '10 minutes');
    raise exception 'No game with that code';
  end if;
  select * into v_me from players where game_id = v_game.id and device_hash = private.hash_secret(p_secret);
  if found and v_me.kicked then raise exception 'You were removed from this game'; end if;
  return jsonb_build_object(
    'game_id', v_game.id,
    'status', v_game.status,
    'player_id', v_me.id,
    'taken_colours', (select coalesce(jsonb_agg(colour), '[]'::jsonb) from players where game_id = v_game.id and not kicked),
    'taken_avatars', (select coalesce(jsonb_agg(avatar), '[]'::jsonb) from players where game_id = v_game.id and not kicked)
  );
end $$;

create or replace function public.join_game(
  p_code text, p_secret text, p_name text, p_avatar text, p_colour text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text := private.hash_secret(p_secret);
  v_game games;
  v_me   players;
  v_name text;
  v_id   uuid;
begin
  select * into v_game from games where code = v_code and status <> 'ended' for update;
  if not found then
    perform private.rate_limit('join_fail', 30, interval '10 minutes');
    raise exception 'No game with that code';
  end if;

  -- Same device: give the seat back with its balance intact.
  select * into v_me from players where game_id = v_game.id and device_hash = v_hash;
  if found then
    if v_me.kicked then raise exception 'You were removed from this game'; end if;
    update players set last_seen = now() where id = v_me.id;
    return jsonb_build_object('game_id', v_game.id, 'player_id', v_me.id, 'rejoined', true);
  end if;

  v_name := private.clean_name(p_name);
  perform private.check_style(p_avatar, p_colour);
  perform private.rate_limit('join', 60, interval '10 minutes');

  if exists (select 1 from players where game_id = v_game.id and not kicked and lower(name) = lower(v_name)) then
    raise exception 'Someone already has that name';
  end if;
  if (select count(*) from players where game_id = v_game.id and not kicked) >= 12 then
    raise exception 'This game is full (12 players)';
  end if;

  insert into players (game_id, device_hash, name, avatar, colour)
  values (v_game.id, v_hash, v_name, p_avatar, p_colour) returning id into v_id;

  if v_game.status in ('active','paused') and v_game.starting_balance > 0 then
    perform private.move(v_game.id, 'bank', null, 'player', v_id, v_game.starting_balance, 'deal', 'Starting money', v_id, false);
  end if;

  perform private.notice(v_game.id, v_game.banker_player, v_name || ' joined the game');
  perform private.ping(v_game.id);
  return jsonb_build_object('game_id', v_game.id, 'player_id', v_id, 'rejoined', false);
end $$;

-- Everything one phone is allowed to see. Also acts as the heartbeat.
create or replace function public.get_state(p_game_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game  games;
  v_me    players;
  v_admin boolean;
  v_show  boolean;
begin
  select * into v_game from games where id = p_game_id;
  if not found then raise exception 'This game no longer exists'; end if;
  v_me := private.caller(p_game_id, p_secret);
  update players set last_seen = now() where id = v_me.id;
  v_admin := private.is_admin(v_game, v_me);
  v_show  := v_admin or v_game.status = 'ended' or coalesce((v_game.rules->>'show_balances')::boolean, true);

  return jsonb_build_object(
    'now', now(),
    'is_admin', v_admin,
    'me', v_me.id,
    'game', jsonb_build_object(
      'id', v_game.id, 'code', v_game.code, 'status', v_game.status,
      'banker_player', v_game.banker_player, 'deputy_player', v_game.deputy_player,
      'starting_balance', v_game.starting_balance, 'go_amount', v_game.go_amount,
      'currency', v_game.currency, 'rules', v_game.rules,
      'free_parking', v_game.free_parking, 'created_at', v_game.created_at
    ),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'avatar', p.avatar, 'colour', p.colour,
        'balance', case when v_show or p.id = v_me.id then p.balance end,
        'is_banker', p.id = v_game.banker_player,
        'frozen', p.frozen, 'locked_until', p.locked_until, 'lock_message', p.lock_message,
        'bankrupt', p.bankrupt, 'kicked', p.kicked, 'joined_at', p.joined_at,
        'online', p.last_seen > now() - interval '40 seconds'
      ) order by p.joined_at), '[]'::jsonb)
      from players p where p.game_id = p_game_id
    ),
    'transactions', (
      select coalesce(jsonb_agg(to_jsonb(t) - 'game_id' order by t.seq desc), '[]'::jsonb)
      from (
        select * from transactions t
        where t.game_id = p_game_id
          and (v_admin or t.from_player = v_me.id or t.to_player = v_me.id)
        order by t.seq desc limit 300
      ) t
    ),
    'requests', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'game_id' order by r.created_at), '[]'::jsonb)
      from requests r
      where r.game_id = p_game_id and r.status = 'pending'
        and (r.from_player = v_me.id or r.to_player = v_me.id or (v_admin and r.kind = 'go'))
    ),
    'events', (
      select coalesce(jsonb_agg(to_jsonb(e) - 'game_id' order by e.created_at desc), '[]'::jsonb)
      from (
        select * from events e
        where e.game_id = p_game_id
          and (e.target_player is null or e.target_player = v_me.id)
          and e.created_at >= v_me.joined_at
        order by e.created_at desc limit 40
      ) e
    )
  );
end $$;

create or replace function public.pay(
  p_game_id uuid, p_secret text, p_to_account text, p_to_player uuid, p_amount int, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game games;
  v_me   players;
  v_to   players;
  v_id   uuid;
begin
  select * into v_game from games where id = p_game_id;
  v_me := private.caller(p_game_id, p_secret);
  perform private.assert_can_act(v_game, v_me);

  if p_to_account = 'player' then
    v_to := private.game_player(p_game_id, p_to_player);
    if v_to.id = v_me.id then raise exception 'You cannot pay yourself'; end if;
  elsif p_to_account = 'parking' then
    if not coalesce((v_game.rules->>'free_parking')::boolean, false) then
      raise exception 'The Free Parking pot is switched off';
    end if;
  elsif p_to_account <> 'bank' then
    raise exception 'Unknown recipient';
  end if;

  v_id := private.move(p_game_id, 'player', v_me.id, p_to_account, v_to.id, p_amount, 'pay', left(p_note, 60), v_me.id, true);
  perform private.ping(p_game_id);
  return v_id;
end $$;

create or replace function public.request_money(
  p_game_id uuid, p_secret text, p_to_player uuid, p_amount int, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game games;
  v_me   players;
  v_to   players;
  v_id   uuid;
begin
  select * into v_game from games where id = p_game_id;
  v_me := private.caller(p_game_id, p_secret);
  perform private.assert_can_act(v_game, v_me);
  if not coalesce((v_game.rules->>'allow_requests')::boolean, true) then
    raise exception 'The Banker has switched off requests';
  end if;
  perform private.check_amount(p_amount);
  v_to := private.game_player(p_game_id, p_to_player);
  if v_to.id = v_me.id then raise exception 'You cannot request from yourself'; end if;
  if v_to.bankrupt then raise exception '% is bankrupt', v_to.name; end if;
  if (select count(*) from requests where game_id = p_game_id and from_player = v_me.id and status = 'pending') >= 5 then
    raise exception 'You already have 5 requests waiting';
  end if;

  insert into requests (game_id, kind, from_player, to_player, amount, note)
  values (p_game_id, 'request', v_me.id, v_to.id, p_amount, nullif(btrim(left(coalesce(p_note, ''), 60)), ''))
  returning id into v_id;
  perform private.ping(p_game_id);
  return v_id;
end $$;

-- Payer answers Pay / Decline; the requester can cancel their own.
create or replace function public.respond_request(
  p_game_id uuid, p_secret text, p_request_id uuid, p_accept boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game games;
  v_me   players;
  v_req  requests;
begin
  select * into v_game from games where id = p_game_id;
  v_me := private.caller(p_game_id, p_secret);
  select * into v_req from requests where id = p_request_id and game_id = p_game_id and kind = 'request' for update;
  if not found or v_req.status <> 'pending' then raise exception 'That request is no longer open'; end if;

  if v_req.from_player = v_me.id and not p_accept then
    update requests set status = 'cancelled' where id = v_req.id;
  elsif v_req.to_player = v_me.id then
    if p_accept then
      perform private.assert_can_act(v_game, v_me);
      perform private.move(p_game_id, 'player', v_me.id, 'player', v_req.from_player, v_req.amount,
                           'request', v_req.note, v_me.id, true);
      update requests set status = 'paid' where id = v_req.id;
    else
      update requests set status = 'declined' where id = v_req.id;
      perform private.notice(p_game_id, v_req.from_player,
        v_me.name || ' declined your request for ' || private.fmt(v_game.currency, v_req.amount), '{"tone":"hot"}');
    end if;
  else
    raise exception 'That request is not yours';
  end if;
  perform private.ping(p_game_id);
end $$;

create or replace function public.claim_go(p_game_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game games;
  v_me   players;
begin
  select * into v_game from games where id = p_game_id;
  v_me := private.caller(p_game_id, p_secret);
  perform private.assert_can_act(v_game, v_me);
  if v_game.go_amount <= 0 then raise exception 'Passing GO pays nothing in this game'; end if;
  if exists (select 1 from requests where game_id = p_game_id and kind = 'go' and from_player = v_me.id and status = 'pending') then
    raise exception 'Your GO claim is already waiting for the Banker';
  end if;

  if coalesce((v_game.rules->>'auto_go')::boolean, false) then
    perform private.move(p_game_id, 'bank', null, 'player', v_me.id, v_game.go_amount, 'go', 'Passed GO', v_me.id, false);
    insert into requests (game_id, kind, from_player, amount, status) values (p_game_id, 'go', v_me.id, v_game.go_amount, 'paid');
    perform private.ping(p_game_id);
    return jsonb_build_object('status', 'paid');
  end if;

  insert into requests (game_id, kind, from_player, amount) values (p_game_id, 'go', v_me.id, v_game.go_amount);
  perform private.ping(p_game_id);
  return jsonb_build_object('status', 'pending');
end $$;

-- Every Banker control. The caller's admin rights are checked here, never trusted from the browser.
create or replace function public.admin_action(
  p_game_id uuid, p_secret text, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game   games;
  v_me     players;
  v_p      players;
  v_q      players;
  v_cur    text;
  v_amount bigint;
  v_note   text := nullif(btrim(left(coalesce(p_payload->>'note', ''), 60)), '');
  v_ids    uuid[];
  v_id     uuid;
  v_tx     transactions;
  v_req    requests;
  v_until  timestamptz;
  v_msg    text;
  v_rules  jsonb;
  v_count  int := 0;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'This game no longer exists'; end if;
  v_me := private.caller(p_game_id, p_secret);
  if not private.is_admin(v_game, v_me) then raise exception 'Only the Banker can do that'; end if;
  if v_game.status = 'ended' and p_action <> 'end_game' then raise exception 'This game is over'; end if;
  v_cur := v_game.currency;

  if p_payload ? 'amount' then
    v_amount := (p_payload->>'amount')::bigint;
  end if;
  if p_payload ? 'player' and p_payload->>'player' is not null then
    v_p := private.game_player(p_game_id, (p_payload->>'player')::uuid);
  end if;
  if p_payload ? 'players' then
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p_payload->'players') x;
  end if;

  case p_action

  when 'start' then
    if v_game.status <> 'lobby' then raise exception 'The game has already started'; end if;
    update games set status = 'active' where id = p_game_id;
    if v_game.starting_balance > 0 then
      for v_q in select * from players where game_id = p_game_id and not kicked loop
        perform private.move(p_game_id, 'bank', null, 'player', v_q.id, v_game.starting_balance, 'deal', 'Starting money', v_me.id, false);
      end loop;
    end if;
    perform private.notice(p_game_id, null, 'Money dealt! Everyone starts with ' || private.fmt(v_cur, v_game.starting_balance), '{"tone":"money"}');

  when 'payout' then
    if v_ids is null then raise exception 'Pick at least one player'; end if;
    foreach v_id in array v_ids loop
      v_q := private.game_player(p_game_id, v_id);
      perform private.move(p_game_id, 'bank', null, 'player', v_q.id, v_amount, 'admin_transfer', coalesce(v_note, 'From the Bank'), v_me.id, false);
      perform private.notice(p_game_id, v_q.id,
        'The Banker paid you ' || private.fmt(v_cur, v_amount) || coalesce(' (' || v_note || ')', ''), '{"tone":"money"}');
      v_count := v_count + 1;
    end loop;

  when 'collect' then
    if v_ids is null then raise exception 'Pick at least one player'; end if;
    foreach v_id in array v_ids loop
      v_q := private.game_player(p_game_id, v_id);
      perform private.move(p_game_id, 'player', v_q.id, 'bank', null, v_amount, 'admin_transfer', coalesce(v_note, 'Collected by the Bank'), v_me.id, true);
      perform private.notice(p_game_id, v_q.id,
        'The Banker collected ' || private.fmt(v_cur, v_amount) || ' from you', '{"tone":"hot"}');
    end loop;

  when 'transfer' then
    v_p := private.game_player(p_game_id, (p_payload->>'from')::uuid);
    v_q := private.game_player(p_game_id, (p_payload->>'to')::uuid);
    perform private.move(p_game_id, 'player', v_p.id, 'player', v_q.id, v_amount, 'admin_transfer', coalesce(v_note, 'Moved by the Banker'), v_me.id, true);
    perform private.notice(p_game_id, v_p.id,
      'The Banker moved ' || private.fmt(v_cur, v_amount) || ' from you to ' || v_q.name, '{"tone":"hot"}');

  when 'set_balance' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    if v_amount is null or v_amount < -9999999 or v_amount > 9999999 then
      raise exception 'Balance must be between -9,999,999 and 9,999,999';
    end if;
    if v_amount > v_p.balance then
      perform private.move(p_game_id, 'bank', null, 'player', v_p.id, v_amount - v_p.balance, 'set_balance', 'Balance set to ' || private.fmt(v_cur, v_amount), v_me.id, false);
    elsif v_amount < v_p.balance then
      perform private.move(p_game_id, 'player', v_p.id, 'bank', null, v_p.balance - v_amount, 'set_balance', 'Balance set to ' || private.fmt(v_cur, v_amount), v_me.id, false);
    end if;
    perform private.notice(p_game_id, v_p.id, 'The Banker set your balance to ' || private.fmt(v_cur, v_amount));

  when 'reverse' then
    select * into v_tx from transactions where id = (p_payload->>'transaction')::uuid and game_id = p_game_id for update;
    if not found then raise exception 'Transaction not found'; end if;
    if v_tx.reversed_by is not null then raise exception 'That transaction was already reversed'; end if;
    if v_tx.type = 'reversal' then raise exception 'A reversal cannot be reversed'; end if;
    v_id := private.move(p_game_id, v_tx.to_account, v_tx.to_player, v_tx.from_account, v_tx.from_player,
                         v_tx.amount, 'reversal', 'Reversed by the Banker', v_me.id, false);
    update transactions set reversed_by = v_id where id = v_tx.id;
    update transactions set reverses = v_tx.id where id = v_id;
    v_msg := 'The Banker reversed a ' || private.fmt(v_cur, v_tx.amount) || ' transaction';
    if v_tx.from_player is not null then perform private.notice(p_game_id, v_tx.from_player, v_msg); end if;
    if v_tx.to_player is not null then perform private.notice(p_game_id, v_tx.to_player, v_msg, '{"tone":"hot"}'); end if;

  when 'rename' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    v_msg := private.clean_name(p_payload->>'name');
    if exists (select 1 from players where game_id = p_game_id and not kicked and id <> v_p.id and lower(name) = lower(v_msg)) then
      raise exception 'Someone already has that name';
    end if;
    update players set name = v_msg where id = v_p.id;
    perform private.notice(p_game_id, v_p.id, 'The Banker renamed you to ' || v_msg);

  when 'restyle' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    perform private.check_style(coalesce(p_payload->>'avatar', v_p.avatar), coalesce(p_payload->>'colour', v_p.colour));
    update players set avatar = coalesce(p_payload->>'avatar', avatar), colour = coalesce(p_payload->>'colour', colour) where id = v_p.id;
    perform private.notice(p_game_id, v_p.id, 'The Banker changed your look');

  when 'freeze' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    update players set frozen = coalesce((p_payload->>'frozen')::boolean, true) where id = v_p.id;
    perform private.notice(p_game_id, v_p.id,
      case when coalesce((p_payload->>'frozen')::boolean, true)
           then 'The Banker froze your account' else 'The Banker unfroze your account' end,
      case when coalesce((p_payload->>'frozen')::boolean, true) then '{"tone":"hot"}'::jsonb else '{"tone":"money"}'::jsonb end);

  when 'lock' then
    v_until := case when p_payload->>'seconds' is null then 'infinity'::timestamptz
                    else now() + make_interval(secs => least(greatest((p_payload->>'seconds')::int, 5), 86400)) end;
    v_msg := nullif(btrim(left(coalesce(p_payload->>'message', ''), 60)), '');
    for v_q in select * from players
               where game_id = p_game_id and not kicked
                 and (case when v_p.id is null then id <> v_me.id else id = v_p.id end) loop
      update players set locked_until = v_until, lock_message = v_msg where id = v_q.id;
      insert into events (game_id, target_player, kind, payload)
      values (p_game_id, v_q.id, 'lock', jsonb_build_object('until', v_until, 'message', v_msg));
      v_count := v_count + 1;
    end loop;

  when 'unlock' then
    for v_q in select * from players
               where game_id = p_game_id and not kicked and locked_until is not null
                 and (v_p.id is null or id = v_p.id) loop
      update players set locked_until = null, lock_message = null where id = v_q.id;
      perform private.notice(p_game_id, v_q.id, 'The Banker unlocked you', '{"tone":"money"}');
    end loop;

  when 'bankrupt' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    if v_p.bankrupt then raise exception '% is already bankrupt', v_p.name; end if;
    if p_payload->>'to' is not null then
      v_q := private.game_player(p_game_id, (p_payload->>'to')::uuid);
      if v_q.id = v_p.id then raise exception 'Pick someone else to receive the money'; end if;
    end if;
    if v_p.balance > 0 then
      perform private.move(p_game_id, 'player', v_p.id, case when v_q.id is null then 'bank' else 'player' end, v_q.id,
                           v_p.balance, 'bankrupt', 'Bankrupt', v_me.id, false);
    elsif v_p.balance < 0 then
      perform private.move(p_game_id, 'bank', null, 'player', v_p.id, -v_p.balance, 'bankrupt', 'Debt cleared on bankruptcy', v_me.id, false);
    end if;
    update players set bankrupt = true where id = v_p.id;
    perform private.notice(p_game_id, null, v_p.name || ' is bankrupt', '{"tone":"hot"}');

  when 'unbankrupt' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    update players set bankrupt = false where id = v_p.id;
    perform private.notice(p_game_id, v_p.id, 'The Banker brought you back into the game', '{"tone":"money"}');

  when 'kick' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    if v_p.id = v_game.banker_player then raise exception 'Hand over the Bank before removing the Banker'; end if;
    if v_p.balance > 0 then
      perform private.move(p_game_id, 'player', v_p.id, 'bank', null, v_p.balance, 'bankrupt', 'Removed from the game', v_me.id, false);
    end if;
    update players set kicked = true where id = v_p.id;
    update requests set status = 'cancelled' where game_id = p_game_id and status = 'pending' and (from_player = v_p.id or to_player = v_p.id);
    update games set deputy_player = null where id = p_game_id and deputy_player = v_p.id;
    perform private.notice(p_game_id, null, v_p.name || ' was removed from the game');

  when 'pause' then
    if v_game.status = 'lobby' then raise exception 'Start the game first'; end if;
    if coalesce((p_payload->>'paused')::boolean, true) then
      update games set status = 'paused' where id = p_game_id;
      perform private.notice(p_game_id, null, 'The Banker paused the game', '{"tone":"sun"}');
    else
      update games set status = 'active' where id = p_game_id;
      perform private.notice(p_game_id, null, 'The game is back on!', '{"tone":"money"}');
    end if;

  when 'hand_over' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    if v_p.id = v_game.banker_player then raise exception '% is already the Banker', v_p.name; end if;
    update players set is_banker = (id = v_p.id) where game_id = p_game_id;
    update games set banker_player = v_p.id,
                     deputy_player = case when deputy_player = v_p.id then null else deputy_player end
    where id = p_game_id;
    perform private.notice(p_game_id, null, v_p.name || ' is now the Banker', '{"tone":"grape"}');

  when 'set_deputy' then
    update games set deputy_player = v_p.id where id = p_game_id;
    if v_p.id is not null then
      perform private.notice(p_game_id, v_p.id, 'You are the deputy Banker. You get the Bank controls if the Banker goes offline.', '{"tone":"grape"}');
    end if;

  when 'edit_rules' then
    v_rules := v_game.rules || coalesce(p_payload->'rules', '{}'::jsonb);
    update games set
      starting_balance = coalesce((p_payload->>'starting_balance')::int, starting_balance),
      go_amount        = coalesce((p_payload->>'go_amount')::int, go_amount),
      currency         = coalesce(nullif(btrim(left(p_payload->>'currency', 3)), ''), currency),
      rules            = jsonb_build_object(
        'free_parking',   coalesce((v_rules->>'free_parking')::boolean, false),
        'show_balances',  coalesce((v_rules->>'show_balances')::boolean, true),
        'allow_requests', coalesce((v_rules->>'allow_requests')::boolean, true),
        'allow_negative', coalesce((v_rules->>'allow_negative')::boolean, false),
        'auto_go',        coalesce((v_rules->>'auto_go')::boolean, false))
    where id = p_game_id;
    if (select starting_balance < 0 or starting_balance > 9999999 or go_amount < 0 or go_amount > 9999999
        from games where id = p_game_id) then
      raise exception 'Amounts must be 0 to 9,999,999';
    end if;
    perform private.notice(p_game_id, null, 'The Banker changed the house rules', '{"tone":"grape"}');

  when 'go_decision' then
    select * into v_req from requests where id = (p_payload->>'request')::uuid and game_id = p_game_id and kind = 'go' for update;
    if not found or v_req.status <> 'pending' then raise exception 'That claim is no longer open'; end if;
    if coalesce((p_payload->>'approve')::boolean, false) then
      perform private.move(p_game_id, 'bank', null, 'player', v_req.from_player, v_req.amount, 'go', 'Passed GO', v_me.id, false);
      update requests set status = 'paid' where id = v_req.id;
    else
      update requests set status = 'declined' where id = v_req.id;
      perform private.notice(p_game_id, v_req.from_player, 'The Banker declined your Pass GO claim', '{"tone":"hot"}');
    end if;

  when 'parking_payout' then
    if v_p.id is null then raise exception 'Pick a player'; end if;
    if v_game.free_parking <= 0 then raise exception 'The Free Parking pot is empty'; end if;
    perform private.move(p_game_id, 'parking', null, 'player', v_p.id, least(v_game.free_parking, 9999999), 'parking', 'Free Parking jackpot', v_me.id, false);
    perform private.notice(p_game_id, null, v_p.name || ' won the Free Parking pot!', '{"tone":"sun"}');

  when 'broadcast' then
    v_msg := nullif(btrim(left(coalesce(p_payload->>'message', ''), 120)), '');
    if v_msg is null then raise exception 'Write a message'; end if;
    insert into events (game_id, target_player, kind, payload)
    values (p_game_id, null, 'broadcast', jsonb_build_object('message', v_msg, 'from', v_me.name));

  when 'end_game' then
    update games set status = 'ended', ended_at = now() where id = p_game_id;
    update requests set status = 'cancelled' where game_id = p_game_id and status = 'pending';
    insert into events (game_id, target_player, kind, payload) values (p_game_id, null, 'ended', '{}'::jsonb);

  else
    raise exception 'Unknown action %', p_action;
  end case;

  perform private.ping(p_game_id);
  return jsonb_build_object('ok', true, 'count', v_count);
end $$;

-- ───────────────────────────── grants ─────────────────────────────

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_game(text, text, text, text, jsonb) from public;
revoke all on function public.find_game(text, text) from public;
revoke all on function public.join_game(text, text, text, text, text) from public;
revoke all on function public.get_state(uuid, text) from public;
revoke all on function public.pay(uuid, text, text, uuid, int, text) from public;
revoke all on function public.request_money(uuid, text, uuid, int, text) from public;
revoke all on function public.respond_request(uuid, text, uuid, boolean) from public;
revoke all on function public.claim_go(uuid, text) from public;
revoke all on function public.admin_action(uuid, text, text, jsonb) from public;

grant execute on function public.create_game(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.find_game(text, text) to anon, authenticated;
grant execute on function public.join_game(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_state(uuid, text) to anon, authenticated;
grant execute on function public.pay(uuid, text, text, uuid, int, text) to anon, authenticated;
grant execute on function public.request_money(uuid, text, uuid, int, text) to anon, authenticated;
grant execute on function public.respond_request(uuid, text, uuid, boolean) to anon, authenticated;
grant execute on function public.claim_go(uuid, text) to anon, authenticated;
grant execute on function public.admin_action(uuid, text, text, jsonb) to anon, authenticated;

-- ───────────────────────────── cleanup ─────────────────────────────

create or replace function private.cleanup() returns void
language sql as $$
  delete from public.games
  where (status = 'ended' and ended_at < now() - interval '1 hour')
     or last_activity < now() - interval '24 hours';
  delete from private.attempts where created_at < now() - interval '1 day';
$$;
