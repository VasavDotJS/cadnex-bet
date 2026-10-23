# CADNEX (CDNX)

A virtual-money sportsbook. Real team and player names, matches simulated live on the device, prices derived from match state, automatic settlement. No real money.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # money, settlement, ledger and cash-out tests (Vitest)
npm run build      # typecheck + production build
SINGLE=1 npx vite build   # one self-contained index.html (worker inlined)
npm run phone      # serve over HTTPS on your Wi-Fi; open the "Network" URL on your phone
```

Your phone and computer must be on the same Wi-Fi. The certificate is self-signed, so the phone
shows a warning the first time: choose Advanced → Proceed (Android) or Show Details → visit this
website (iPhone). HTTPS is required because password hashing only works on secure pages.

## Architecture

```
UI (React pages, src/features/*)  ── hooks / Zustand stores (src/store/*)
        │
Service layer (src/services/*): authService, walletService, betService, statsService, rewardService
        │                         all money as bigint minor units; every balance change writes a ledger row
Persistence (src/db/db.ts): Dexie / IndexedDB
        │
Engine (src/engine/*, runs in a Web Worker; main-thread fallback)
  scheduler   rolling fixtures so there are always live, upcoming and finished matches + 6 days ahead
  sports/*    football (Poisson shots × xG), basketball (possessions), tennis (point Markov),
              cricket T20 (ball by ball), esports (CS2/Valorant rounds with economy, LoL by minute)
  pricing     football: analytic Poisson grid over the remaining match; other sports: Monte Carlo
              of the rest of the match. Margin applied per market. Hidden per-match variables
              are never visible to pricing, so upsets happen.
  markets     each market defines how it settles from the final state, and (where possible)
              how it settles early. The same functions price and settle.
```

Randomness for real results comes from `crypto.getRandomValues`; results do not exist before they happen.

## Phase 1 (this build)

Design system (both themes) and shell, signature components A–M, auth (PBKDF2, sessions, reset flow, isolated accounts), wallet (set/add/subtract balance, simulated deposit/withdraw, 56 currencies incl. crypto, convert or keep, full filterable ledger), five-sport simulation engine, in-play odds with suspensions, Home, Sports, Live Centre, Event detail, bet slip (single / parlay / system, odds-change policy, keypad, booking codes), automatic settlement incl. Asian quarter lines and void rules, cash out (full and partial), My Bets, receipts, Profile & stats, Settings, Responsible gaming (enforced limits, breaks, self-exclusion, session reminders), notifications, search palette, Help & rules, 404 and error boundary, daily reward.

## Remaining modules

1. Bet Builder (same-game parlays with contradiction blocking and correlation pricing).
2. Promotions screen: welcome bonus, odds boosts, free bets with real terms and wagering.
3. Leaderboard with weekly profit ranking and rival bots.
4. Language-ready string catalogue.
5. Shared-element transition from match card to event header; motion polish pass.
6. Wider unit-test coverage of market settlement per sport.
