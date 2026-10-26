// Runs the migration against an in-process Postgres (PGlite) and exercises
// every RPC as the `anon` role, the same role the browser uses on Supabase.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema realtime;
  create function realtime.send(jsonb, text, text, boolean) returns void language sql as 'select null';
`)
for (const f of ['001_monotony.sql', '003_pin_search_path.sql', '004_admin_control.sql']) {
  await db.exec(readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8'))
}
await db.exec(`grant usage on schema public to anon;`)

let passed = 0
const ok = (cond, label) => {
  if (!cond) throw new Error('FAILED: ' + label)
  passed++
  console.log('  ✓', label)
}

async function rpc(fn, args) {
  await db.exec('set role anon')
  try {
    const names = Object.keys(args)
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
    const res = await db.query(sql, names.map((n) => args[n]))
    return res.rows[0].r
  } finally {
    await db.exec('reset role')
  }
}
async function fails(promise, match, label) {
  try {
    await promise
  } catch (e) {
    ok(String(e.message).includes(match), `${label} → "${e.message}"`)
    return
  }
  throw new Error('FAILED (no error): ' + label)
}

const secret = () => randomBytes(24).toString('hex')
let bank = secret(), alex = secret(), sam = secret(), jo = secret()

console.log('setup')
const g = await rpc('create_game', {
  p_secret: bank, p_name: 'Harry', p_avatar: 'tophat', p_colour: 'red',
  p_settings: { starting_balance: 1500, go_amount: 200, currency: 'M', rules: { free_parking: true } },
})
ok(/^[A-HJKMNP-Z2-9]{6}$/.test(g.code), 'code uses the unambiguous alphabet: ' + g.code)
const G = g.game_id
const found = await rpc('find_game', { p_code: g.code.slice(0, 3) + '-' + g.code.slice(3).toLowerCase(), p_secret: alex })
ok(found.game_id === G && found.player_id === null, 'find_game accepts dashed lowercase code')
const a = await rpc('join_game', { p_code: g.code, p_secret: alex, p_name: 'Alex', p_avatar: 'car', p_colour: 'blue' })
const s = await rpc('join_game', { p_code: g.code, p_secret: sam, p_name: 'Sam', p_avatar: 'dog', p_colour: 'green' })
const again = await rpc('join_game', { p_code: g.code, p_secret: alex, p_name: 'Whatever', p_avatar: 'cat', p_colour: 'pink' })
ok(again.player_id === a.player_id && again.rejoined, 'same device rejoins the same seat')
await fails(rpc('join_game', { p_code: g.code, p_secret: jo, p_name: 'alex', p_avatar: 'cat', p_colour: 'pink' }), 'already has that name', 'duplicate name rejected')
await fails(rpc('join_game', { p_code: 'ZZZZZZ', p_secret: jo, p_name: 'Jo', p_avatar: 'cat', p_colour: 'pink' }), 'No game', 'bad code rejected')
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'player', p_to_player: s.player_id, p_amount: 10 }), 'not started', 'no paying in the lobby')

console.log('direct table access')
await db.exec('set role anon')
for (const t of ['games', 'players', 'transactions', 'requests', 'events']) {
  await fails(db.query(`select * from public.${t}`), 'permission denied', `anon cannot read ${t}`)
}
await fails(db.query(`update public.players set balance = 999999`), 'permission denied', 'anon cannot update balances')
await fails(db.query(`select private.move($1,'bank',null,'player',$2,500,'pay',null,null,false)`, [G, a.player_id]), 'permission denied', 'anon cannot call private.move')
await db.exec('reset role')

console.log('money')
await fails(rpc('admin_action', { p_game_id: G, p_secret: alex, p_action: 'start', p_payload: {} }), 'Only the Banker', 'non-banker admin_action rejected')
await rpc('admin_action', { p_game_id: G, p_secret: bank, p_action: 'start', p_payload: {} })
const bal = async (who, as = bank) => {
  const st = await rpc('get_state', { p_game_id: G, p_secret: as })
  return Object.fromEntries(st.players.map((p) => [p.name, p.balance]))[who]
}
ok((await bal('Alex')) === 1500 && (await bal('Harry')) === 1500, 'everyone dealt M1,500 including the Banker')
await rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'player', p_to_player: s.player_id, p_amount: 200, p_note: 'rent' })
ok((await bal('Alex')) === 1300 && (await bal('Sam')) === 1700, 'pay moves money both sides')
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'player', p_to_player: s.player_id, p_amount: 5000 }), 'Not enough money', 'overspend rejected')
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'player', p_to_player: s.player_id, p_amount: 10000000 }), '9,999,999', 'over max amount rejected')
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'player', p_to_player: a.player_id, p_amount: 1 }), 'yourself', 'self-pay rejected')
await rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'parking', p_to_player: null, p_amount: 100 })
await rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'bank', p_to_player: null, p_amount: 100 })
let st = await rpc('get_state', { p_game_id: G, p_secret: alex })
ok(st.game.free_parking === 100 && (await bal('Alex')) === 1100, 'pay into Free Parking and the Bank')
ok(st.transactions.every((t) => t.from_player === a.player_id || t.to_player === a.player_id), 'players only see their own transactions')

console.log('requests and GO')
const rq = await rpc('request_money', { p_game_id: G, p_secret: sam, p_to_player: a.player_id, p_amount: 50, p_note: 'trade' })
st = await rpc('get_state', { p_game_id: G, p_secret: alex })
ok(st.requests.some((r) => r.id === rq), 'payer sees the pending request')
await fails(rpc('respond_request', { p_game_id: G, p_secret: sam, p_request_id: rq, p_accept: true }), 'not yours', 'requester cannot accept own request')
await rpc('respond_request', { p_game_id: G, p_secret: alex, p_request_id: rq, p_accept: true })
ok((await bal('Alex')) === 1050 && (await bal('Sam')) === 1750, 'accepted request pays')
const rq2 = await rpc('request_money', { p_game_id: G, p_secret: sam, p_to_player: a.player_id, p_amount: 50 })
await rpc('respond_request', { p_game_id: G, p_secret: alex, p_request_id: rq2, p_accept: false })
st = await rpc('get_state', { p_game_id: G, p_secret: sam })
ok(st.events.some((e) => e.payload.text?.includes('declined')), 'requester notified of decline')
const go = await rpc('claim_go', { p_game_id: G, p_secret: alex })
ok(go.status === 'pending', 'GO claim waits for the Banker')
await fails(rpc('claim_go', { p_game_id: G, p_secret: alex }), 'already waiting', 'one GO claim at a time')
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
const claim = st.requests.find((r) => r.kind === 'go')
await rpc('admin_action', { p_game_id: G, p_secret: bank, p_action: 'go_decision', p_payload: { request: claim.id, approve: true } })
ok((await bal('Alex')) === 1250, 'approved GO pays M200')
await rpc('admin_action', { p_game_id: G, p_secret: bank, p_action: 'edit_rules', p_payload: { rules: { auto_go: true } } })
ok((await rpc('claim_go', { p_game_id: G, p_secret: alex })).status === 'paid' && (await bal('Alex')) === 1450, 'auto-approve GO')

console.log('banker controls')
const A = a.player_id, S = s.player_id
const act = (action, payload) => rpc('admin_action', { p_game_id: G, p_secret: bank, p_action: action, p_payload: payload })
await act('payout', { players: [A, S], amount: 100 })
ok((await bal('Alex')) === 1550 && (await bal('Sam')) === 1850, 'payout to several players')
await act('collect', { players: [A], amount: 50 })
ok((await bal('Alex')) === 1500, 'collect to Bank')
await act('transfer', { from: S, to: A, amount: 200 })
ok((await bal('Alex')) === 1700 && (await bal('Sam')) === 1650, 'forced transfer')
st = await rpc('get_state', { p_game_id: G, p_secret: sam })
ok(st.events.some((e) => e.payload.text === 'The Banker moved M200 from you to Alex'), 'affected player sees the audit notice')
await act('set_balance', { player: A, amount: 42 })
ok((await bal('Alex')) === 42, 'set balance')
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
const last = st.transactions[0]
await act('reverse', { transaction: last.id })
ok((await bal('Alex')) === 1700, 'reverse a transaction')
await fails(act('reverse', { transaction: last.id }), 'already reversed', 'cannot reverse twice')
await act('freeze', { player: A, frozen: true })
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'bank', p_to_player: null, p_amount: 1 }), 'frozen', 'frozen player cannot pay')
await act('freeze', { player: A, frozen: false })
await act('lock', { player: A, seconds: 30, message: 'Jail!' })
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'bank', p_to_player: null, p_amount: 1 }), 'locked', 'locked player cannot pay')
st = await rpc('get_state', { p_game_id: G, p_secret: alex })
ok(st.players.find((p) => p.id === A).lock_message === 'Jail!', 'lock message visible to player')
await act('unlock', { player: A })
await act('lock', { seconds: null, message: 'Dinner' })
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.players.filter((p) => p.locked_until).length === 2 && !st.players.find((p) => p.is_banker).locked_until, 'lock everyone except the Banker')
await act('unlock', {})
await act('rename', { player: A, name: 'Alexander' })
await act('restyle', { player: A, avatar: 'duck', colour: 'yellow' })
st = await rpc('get_state', { p_game_id: G, p_secret: alex })
ok(st.players.find((p) => p.id === A).name === 'Alexander' && st.players.find((p) => p.id === A).avatar === 'duck', 'rename and restyle')
await act('pause', { paused: true })
await fails(rpc('pay', { p_game_id: G, p_secret: alex, p_to_account: 'bank', p_to_player: null, p_amount: 1 }), 'paused', 'paused game blocks payments')
await act('pause', { paused: false })
await act('parking_payout', { player: S })
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.game.free_parking === 0 && (await bal('Sam')) === 1750, 'Free Parking pot paid out')
await act('edit_rules', { rules: { show_balances: false } })
st = await rpc('get_state', { p_game_id: G, p_secret: alex })
ok(st.players.find((p) => p.id === S).balance === null && st.players.find((p) => p.id === A).balance === 1700, 'hidden balances: only your own is sent')
await act('broadcast', { message: 'Snack break' })
st = await rpc('get_state', { p_game_id: G, p_secret: sam })
ok(st.events.some((e) => e.kind === 'broadcast'), 'broadcast reaches players')
const j = await rpc('join_game', { p_code: g.code, p_secret: jo, p_name: 'Jo', p_avatar: 'boat', p_colour: 'pink' })
ok((await bal('Jo')) === 1500, 'late joiner gets the starting balance')
await act('bankrupt', { player: j.player_id, to: S })
ok((await bal('Jo')) === 0 && (await bal('Sam')) === 3250, 'bankrupt moves money to another player')
await act('kick', { player: j.player_id })
await fails(rpc('get_state', { p_game_id: G, p_secret: jo }), 'removed', 'kicked player is locked out')
console.log('admin control')
await rpc('report_device', { p_game_id: G, p_secret: alex, p_info: { os: 'iOS 18', browser: 'Safari 18', battery: 0.42 } })
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.players.find((p) => p.id === A).device.os === 'iOS 18', 'Banker sees device details')
ok(st.admin_log.some((l) => l.action === 'transfer' && l.target === S), 'admin actions are logged with their target')
st = await rpc('get_state', { p_game_id: G, p_secret: sam })
ok(st.players.every((p) => p.device === undefined) && st.admin_log.length === 0, 'players cannot see device details or the admin log')
await fails(rpc('report_device', { p_game_id: G, p_secret: alex, p_info: { junk: 'x'.repeat(5000) } }), 'not valid', 'oversized device report rejected')
await fails(rpc('report_device', { p_game_id: G, p_secret: secret(), p_info: {} }), 'not in this game', 'strangers cannot report devices')

await act('edit_rules', { rules: { joining_open: false }, quiet: true })
await fails(rpc('join_game', { p_code: g.code, p_secret: secret(), p_name: 'Zed', p_avatar: 'cat', p_colour: 'pink' }), 'closed', 'closed game refuses new players')
ok((await rpc('join_game', { p_code: g.code, p_secret: alex, p_name: 'x', p_avatar: 'cat', p_colour: 'pink' })).rejoined, 'existing players can still rejoin a closed game')
await act('edit_rules', { rules: { joining_open: true } })
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.game.rules.joining_open === true && st.game.rules.free_parking === true && st.game.rules.show_balances === false, 'editing one rule keeps the others')

const sc = await act('seat_code', { player: A })
ok(/^\d{6}$/.test(sc.code), 'seat code issued: ' + sc.code)
const newPhone = secret()
await fails(rpc('claim_seat', { p_code: g.code, p_secret: newPhone, p_claim: sc.code === '000000' ? '111111' : '000000' }), 'wrong or has expired', 'wrong seat code rejected')
await fails(rpc('claim_seat', { p_code: g.code, p_secret: sam, p_claim: sc.code }), 'already has a seat', 'a phone with a seat cannot claim another')
const cl = await rpc('claim_seat', { p_code: g.code, p_secret: newPhone, p_claim: sc.code })
ok(cl.player_id === A, 'new phone takes over the seat')
await fails(rpc('get_state', { p_game_id: G, p_secret: alex }), 'not in this game', 'old phone loses the seat')
await fails(rpc('claim_seat', { p_code: g.code, p_secret: secret(), p_claim: sc.code }), 'wrong or has expired', 'seat codes work once')
alex = newPhone
ok((await bal('Alexander')) === 1700, 'balance survives the move')

await act('fine', { players: [S], amount: 50 })
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.game.free_parking === 50, 'fines go into Free Parking')
await act('set_parking', { amount: 500 })
ok((await rpc('get_state', { p_game_id: G, p_secret: bank })).game.free_parking === 500, 'set the pot')
await act('freeze_all', { frozen: true })
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.players.filter((p) => !p.kicked && !p.is_banker).every((p) => p.frozen) && !st.players.find((p) => p.is_banker).frozen, 'freeze everyone except the Banker')
await act('freeze_all', { frozen: false })
await act('message', { player: S, message: 'Psst' })
ok((await rpc('get_state', { p_game_id: G, p_secret: sam })).events.some((e) => e.kind === 'broadcast' && e.payload.private), 'private message reaches its player')
ok(!(await rpc('get_state', { p_game_id: G, p_secret: alex })).events.some((e) => e.payload.message === 'Psst'), 'other players do not see it')
await act('reload', { player: S })
ok((await rpc('get_state', { p_game_id: G, p_secret: sam })).events.some((e) => e.kind === 'reload'), 'remote reload event')
const rq3 = await rpc('request_money', { p_game_id: G, p_secret: sam, p_to_player: A, p_amount: 10 })
ok((await rpc('get_state', { p_game_id: G, p_secret: bank })).requests.some((r) => r.id === rq3), 'Banker sees player requests')
await act('cancel_request', { request: rq3 })
ok(!(await rpc('get_state', { p_game_id: G, p_secret: alex })).requests.some((r) => r.id === rq3), 'Banker cancels a request')
await act('restore', { kicked_player: j.player_id })
ok(!(await rpc('get_state', { p_game_id: G, p_secret: bank })).players.find((p) => p.id === j.player_id).kicked, 'removed player restored')
await act('restart', {})
st = await rpc('get_state', { p_game_id: G, p_secret: bank })
ok(st.players.filter((p) => !p.kicked).every((p) => p.balance === 1500 && !p.bankrupt) && st.game.free_parking === 0, 'restart resets every balance and the pot')
const nc = await act('new_code', {})
await fails(rpc('find_game', { p_code: g.code, p_secret: secret() }), 'No game', 'old code stops working')
ok((await rpc('find_game', { p_code: nc.code, p_secret: secret() })).game_id === G, 'new code works')

await act('set_deputy', { player: S })
await fails(rpc('admin_action', { p_game_id: G, p_secret: sam, p_action: 'broadcast', p_payload: { message: 'x' } }), 'Only the Banker', 'deputy has no powers while the Banker is online')
await db.exec(`update players set last_seen = now() - interval '2 minutes' where id = '${g.player_id}'`)
await rpc('admin_action', { p_game_id: G, p_secret: sam, p_action: 'broadcast', p_payload: { message: 'Deputy here' } })
ok(true, 'deputy takes over when the Banker is offline')
await act('hand_over', { player: A })
await fails(act('broadcast', { message: 'x' }), 'Only the Banker', 'old Banker loses admin after hand over')
await rpc('admin_action', { p_game_id: G, p_secret: alex, p_action: 'end_game', p_payload: {} })
st = await rpc('get_state', { p_game_id: G, p_secret: sam })
ok(st.game.status === 'ended' && st.players.every((p) => p.balance !== null), 'game over reveals all balances')

console.log(`\n${passed} checks passed`)
