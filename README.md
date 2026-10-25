# Monotony

Monopoly money on everyone’s phone. One installable web app with a **Player** mode and a **Banker** mode, backed by Supabase. There are no accounts and no real money, and a game only exists while it is being played.

## Playing

1. The Banker taps **Start a game**, picks a name, avatar and house rules, and gets a 6-character code and a QR code.
2. Everyone else taps **Join a game** and types the code or scans the QR code.
3. The Banker taps **Deal money**. Players pay each other, the Bank or Free Parking, request money, and claim Pass GO.
4. The Banker's **Bank** tab (the dark vault) has every admin control: pay out, collect, forced transfer, set balance, reverse, freeze, lock (“Jail!”), bankrupt, kick, pause, broadcast, deputy, hand over, edit rules, the Free Parking payout and End game.

On a phone, use **Share → Add to Home Screen** to install it full-screen.

## How it works

- `src/`: Vite + React + TypeScript, Tailwind CSS v4, Framer Motion, HashRouter, PWA through `vite-plugin-pwa`.
- `supabase/migrations/`: the whole backend. Tables have RLS switched on and no client grants. Every read and write goes through `security definer` Postgres functions (`create_game`, `join_game`, `get_state`, `pay`, `request_money`, `respond_request`, `claim_go`, `admin_action`). Banker checks happen inside those functions.
- **Identity:** each browser makes a random 256-bit device key and keeps it in localStorage. The database stores only its SHA-256 hash, which gives you your seat back when you rejoin. This replaces Supabase anonymous sign-ins, so the project needs no auth settings.
- **Live updates:** after every change the functions call `realtime.send` on a public channel named after the game's UUID. The ping carries no game data. Phones then re-fetch their own view through `get_state`, and polling every few seconds acts as a fallback.
- **Cleanup:** an hourly `pg_cron` job deletes games that ended an hour ago or have been idle for 24 hours.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173/monotony/
npm run test:sql   # runs the migration in PGlite and checks every RPC as the anon role
npm run deploy     # builds and pushes dist/ to the gh-pages branch
```

Add `?seat=2` to the URL (before the `#`) to play a second, separate seat in another tab on the same device.

The Supabase URL and publishable key default to the `monotony` project (`src/lib/config.ts`). Override them with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The key is designed to be public: the RPC-only rule above is what keeps money safe.

## Honest constraints

- “Lock app” locks only Monotony, not the phone. The real enforcement is on the server.
- Vibration doesn't work on iPhone (Safari has no Vibration API). Sound and animation are used there instead.
- Sound needs a first tap before the browser allows it.
- The free Supabase plan pauses a project after a week with no activity. Resume it from the Supabase dashboard before the next game.
