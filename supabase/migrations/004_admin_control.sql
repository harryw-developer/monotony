-- More Banker control: device details, an admin log, moving a seat to a new
-- phone, closing the game to new players, and a batch of new admin actions.

alter table public.players
  add column device        jsonb not null default '{}'::jsonb,
  add column visits        int not null default 1,
  add column claim_code    text,
  add column claim_expires timestamptz;

alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('lock','broadcast','notice','ended','reload'));

create table public.admin_log (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  actor      uuid references public.players(id) on delete set null,
  action     text not null,
  target     uuid references public.players(id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.admin_log (game_id, created_at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;

-- ───────────────────────────── device reports ─────────────────────────────

-- The phone describes itself (browser, OS, screen, battery…). Only the Banker sees it.
create or replace function public.report_device(p_game_id uuid, p_secret text, p_info jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me players;
begin
  v_me := private.caller(p_game_id, p_secret);
  if p_info is null or jsonb_typeof(p_info) <> 'object' or length(p_info::text) > 4000 then
    raise exception 'Device report is not valid';
  end if;
  update players set device = p_info || jsonb_build_object('reported_at', now()), last_seen = now()
  where id = v_me.id;
end $$;

-- ───────────────────────────── joining ─────────────────────────────

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
    'joining_open', coalesce((v_game.rules->>'joining_open')::boolean, true),
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

  if not coalesce((v_game.rules->>'joining_open')::boolean, true) then
    raise exception 'The Banker has closed this game to new players';
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

-- A new phone takes over an existing seat with a one-time code from the Banker.
create or replace function public.claim_seat(p_code text, p_secret text, p_claim text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_claim text := regexp_replace(coalesce(p_claim, ''), '\D', '', 'g');
  v_hash  text := private.hash_secret(p_secret);
  v_game  games;
  v_seat  players;
  v_mine  players;
begin
  select * into v_game from games where code = v_code and status <> 'ended' for update;
  if not found then
    perform private.rate_limit('join_fail', 30, interval '10 minutes');
    raise exception 'No game with that code';
  end if;
  perform private.rate_limit('claim', 20, interval '10 minutes');

  select * into v_mine from players where game_id = v_game.id and device_hash = v_hash;
  if found then
    if v_mine.kicked then raise exception 'This phone was removed from this game'; end if;
    raise exception 'This phone already has a seat in this game';
  end if;

  select * into v_seat from players
  where game_id = v_game.id and not kicked and claim_code = v_claim and claim_expires > now()
  for update;
  if not found or length(v_claim) <> 6 then raise exception 'That seat code is wrong or has expired'; end if;

  update players set device_hash = v_hash, claim_code = null, claim_expires = null,
                     device = '{}'::jsonb, last_seen = now(), visits = visits + 1
  where id = v_seat.id;
  insert into admin_log (game_id, actor, action, target, payload)
  values (v_game.id, v_seat.id, 'seat_moved', v_seat.id, '{}'::jsonb);
  perform private.notice(v_game.id, v_game.banker_player, v_seat.name || ' moved to a new phone', '{"tone":"grape"}');
  perform private.ping(v_game.id);
  return jsonb_build_object('game_id', v_game.id, 'player_id', v_seat.id);
end $$;

-- ───────────────────────────── state ─────────────────────────────

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
  -- Coming back after two minutes away counts as a new visit.
  update players set last_seen = now(),
                     visits = visits + case when last_seen < now() - interval '2 minutes' then 1 else 0 end
  where id = v_me.id;
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
      ) || case when v_admin then jsonb_build_object(
        'device', p.device, 'visits', p.visits, 'last_seen', p.last_seen,
        'claim_code', case when p.claim_expires > now() then p.claim_code end,
        'claim_expires', case when p.claim_expires > now() then p.claim_expires end
      ) else '{}'::jsonb end
      order by p.joined_at), '[]'::jsonb)
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
        and (v_admin or r.from_player = v_me.id or r.to_player = v_me.id)
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
    ),
    'admin_log', case when v_admin then (
      select coalesce(jsonb_agg(to_jsonb(a) - 'game_id' order by a.created_at desc), '[]'::jsonb)
      from (select * from admin_log a where a.game_id = p_game_id order by a.created_at desc limit 150) a
    ) else '[]'::jsonb end
  );
end $$;

-- ───────────────────────────── admin ─────────────────────────────

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
  v_result jsonb := '{}'::jsonb;
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
      v_count := v_count + 1;
    end loop;

  when 'fine' then
    -- Like collect, but the money goes into the Free Parking pot.
    if not coalesce((v_game.rules->>'free_parking')::boolean, false) then
      raise exception 'Turn on the Free Parking pot first';
    end if;
    if v_ids is null then raise exception 'Pick at least one player'; end if;
    foreach v_id in array v_ids loop
      v_q := private.game_player(p_game_id, v_id);
      perform private.move(p_game_id, 'player', v_q.id, 'parking', null, v_amount, 'admin_transfer', coalesce(v_note, 'Fine'), v_me.id, true);
      perform private.notice(p_game_id, v_q.id,
        'The Banker fined you ' || private.fmt(v_cur, v_amount) || ' into Free Parking', '{"tone":"hot"}');
      v_count := v_count + 1;
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

  when 'set_parking' then
    if v_amount is null or v_amount < 0 or v_amount > 9999999 then raise exception 'Pot must be 0 to 9,999,999'; end if;
    if v_amount > v_game.free_parking then
      perform private.move(p_game_id, 'bank', null, 'parking', null, v_amount - v_game.free_parking, 'admin_transfer', 'Pot topped up', v_me.id, false);
    elsif v_amount < v_game.free_parking then
      perform private.move(p_game_id, 'parking', null, 'bank', null, v_game.free_parking - v_amount, 'admin_transfer', 'Pot reduced', v_me.id, false);
    end if;

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

  when 'freeze_all' then
    for v_q in select * from players where game_id = p_game_id and not kicked and id <> v_me.id loop
      update players set frozen = coalesce((p_payload->>'frozen')::boolean, true) where id = v_q.id;
      v_count := v_count + 1;
    end loop;
    perform private.notice(p_game_id, null,
      case when coalesce((p_payload->>'frozen')::boolean, true)
           then 'The Banker froze every account' else 'Accounts unfrozen. Play on!' end,
      case when coalesce((p_payload->>'frozen')::boolean, true) then '{"tone":"sky"}'::jsonb else '{"tone":"money"}'::jsonb end);

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
    update players set kicked = true, claim_code = null, claim_expires = null where id = v_p.id;
    update requests set status = 'cancelled' where game_id = p_game_id and status = 'pending' and (from_player = v_p.id or to_player = v_p.id);
    update games set deputy_player = null where id = p_game_id and deputy_player = v_p.id;
    perform private.notice(p_game_id, null, v_p.name || ' was removed from the game');

  when 'restore' then
    -- Let a removed player back in (their money stays with the Bank).
    select * into v_q from players where id = (p_payload->>'kicked_player')::uuid and game_id = p_game_id and kicked;
    if not found then raise exception 'That player is not removed'; end if;
    if exists (select 1 from players where game_id = p_game_id and not kicked and lower(name) = lower(v_q.name)) then
      raise exception 'Someone else is now called %', v_q.name;
    end if;
    update players set kicked = false where id = v_q.id;
    perform private.notice(p_game_id, null, v_q.name || ' is back in the game', '{"tone":"money"}');
    v_p := v_q;

  when 'pause' then
    if v_game.status = 'lobby' then raise exception 'Start the game first'; end if;
    if coalesce((p_payload->>'paused')::boolean, true) then
      update games set status = 'paused' where id = p_game_id;
      perform private.notice(p_game_id, null, 'The Banker paused the game', '{"tone":"sun"}');
    else
      update games set status = 'active' where id = p_game_id;
      perform private.notice(p_game_id, null, 'The game is back on!', '{"tone":"money"}');
    end if;

  when 'restart' then
    -- Everyone back to the starting balance; the pot goes back to the Bank.
    if v_game.status = 'lobby' then raise exception 'Start the game first'; end if;
    for v_q in select * from players where game_id = p_game_id and not kicked loop
      if v_game.starting_balance > v_q.balance then
        perform private.move(p_game_id, 'bank', null, 'player', v_q.id, v_game.starting_balance - v_q.balance, 'set_balance', 'Game restarted', v_me.id, false);
      elsif v_game.starting_balance < v_q.balance then
        perform private.move(p_game_id, 'player', v_q.id, 'bank', null, v_q.balance - v_game.starting_balance, 'set_balance', 'Game restarted', v_me.id, false);
      end if;
      v_count := v_count + 1;
    end loop;
    update players set bankrupt = false, frozen = false, locked_until = null, lock_message = null
    where game_id = p_game_id and not kicked;
    if v_game.free_parking > 0 then
      perform private.move(p_game_id, 'parking', null, 'bank', null, v_game.free_parking, 'admin_transfer', 'Game restarted', v_me.id, false);
    end if;
    update requests set status = 'cancelled' where game_id = p_game_id and status = 'pending';
    update games set status = 'active' where id = p_game_id;
    perform private.notice(p_game_id, null, 'New round! Everyone is back to ' || private.fmt(v_cur, v_game.starting_balance), '{"tone":"sun"}');

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
        'auto_go',        coalesce((v_rules->>'auto_go')::boolean, false),
        'joining_open',   coalesce((v_rules->>'joining_open')::boolean, true))
    where id = p_game_id;
    if (select starting_balance < 0 or starting_balance > 9999999 or go_amount < 0 or go_amount > 9999999
        from games where id = p_game_id) then
      raise exception 'Amounts must be 0 to 9,999,999';
    end if;
    if not (p_payload ? 'quiet') then
      perform private.notice(p_game_id, null, 'The Banker changed the house rules', '{"tone":"grape"}');
    end if;

  when 'new_code' then
    v_msg := private.new_code();
    update games set code = v_msg where id = p_game_id;
    v_result := jsonb_build_object('code', v_msg);

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

  when 'cancel_request' then
    select * into v_req from requests where id = (p_payload->>'request')::uuid and game_id = p_game_id for update;
    if not found or v_req.status <> 'pending' then raise exception 'That request is no longer open'; end if;
    update requests set status = 'cancelled' where id = v_req.id;
    perform private.notice(p_game_id, v_req.from_player, 'The Banker cancelled your request for ' || private.fmt(v_cur, v_req.amount), '{"tone":"hot"}');

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

  when 'message' then
    -- A full-screen message to one player only.
    if v_p.id is null then raise exception 'Pick a player'; end if;
    v_msg := nullif(btrim(left(coalesce(p_payload->>'message', ''), 120)), '');
    if v_msg is null then raise exception 'Write a message'; end if;
    insert into events (game_id, target_player, kind, payload)
    values (p_game_id, v_p.id, 'broadcast', jsonb_build_object('message', v_msg, 'from', v_me.name, 'private', true));

  when 'reload' then
    -- Make a phone (or every phone) reload the app, e.g. to pick up an update.
    for v_q in select * from players
               where game_id = p_game_id and not kicked
                 and (case when v_p.id is null then id <> v_me.id else id = v_p.id end) loop
      insert into events (game_id, target_player, kind, payload) values (p_game_id, v_q.id, 'reload', '{}'::jsonb);
      v_count := v_count + 1;
    end loop;

  when 'seat_code' then
    -- One-time code that moves this seat to a new phone (lost or flat phone).
    if v_p.id is null then raise exception 'Pick a player'; end if;
    loop
      v_msg := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from players where game_id = p_game_id and claim_code = v_msg and claim_expires > now());
    end loop;
    update players set claim_code = v_msg, claim_expires = now() + interval '15 minutes' where id = v_p.id;
    v_result := jsonb_build_object('code', v_msg);

  when 'end_game' then
    update games set status = 'ended', ended_at = now() where id = p_game_id;
    update requests set status = 'cancelled' where game_id = p_game_id and status = 'pending';
    insert into events (game_id, target_player, kind, payload) values (p_game_id, null, 'ended', '{}'::jsonb);

  else
    raise exception 'Unknown action %', p_action;
  end case;

  insert into admin_log (game_id, actor, action, target, payload)
  values (p_game_id, v_me.id, p_action,
          coalesce(v_p.id, (p_payload->>'to')::uuid),
          (p_payload - 'note') || case when v_note is not null then jsonb_build_object('note', v_note) else '{}'::jsonb end);

  perform private.ping(p_game_id);
  return jsonb_build_object('ok', true, 'count', v_count) || v_result;
end $$;

-- ───────────────────────────── grants ─────────────────────────────

revoke all on function public.report_device(uuid, text, jsonb) from public;
revoke all on function public.claim_seat(text, text, text) from public;
grant execute on function public.report_device(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.claim_seat(text, text, text) to anon, authenticated;
