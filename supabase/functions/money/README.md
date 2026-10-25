# money (Supabase Edge Function)

The only writer of wallets, ledger entries and bets. Source: `src/money/` (rules in `core.ts`,
request handling in `server.ts`, runtime glue in `edge.ts`).

To change it:

1. Edit `src/money/…` and run `npm test`.
2. `npm run build:money` regenerates `money.js`.
3. Commit and push, then point `index.ts` at the new commit hash and deploy with
   `verify_jwt` off (the function checks the session itself).

Pinning to a commit means the deployed code can't change underneath you.
