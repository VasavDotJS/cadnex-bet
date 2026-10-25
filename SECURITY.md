# Security

CADNEX uses virtual money only, but accounts, sessions and the admin panel are protected as if it didn't.

## How it's protected

**Money is handled by the server**
- Wallets, ledger entries and bets can only be written by the server's `money` function, never by the app. The app asks; the server decides.
- Every bet is re-priced from the server's own copy of the live match before it's accepted. Inflated odds, closed markets and finished matches are refused, and every label on the bet comes from the server's data.
- Cash-outs are valued by the server and never pay more than the player was shown. Bets are settled from the server's results, with a payout that can only happen once.
- Changes are atomic, with a check that the balance hasn't moved underneath them.
- Self-exclusion, breaks and deposit, stake and loss limits are enforced by the server too, and a break or self-exclusion can't be lifted early.

**Accounts and data**
- Sign-in is handled by Supabase Auth. CADNEX never sees or stores passwords.
- New passwords are checked against known data breaches (Have I Been Pwned). Only the first five characters of the password's hash ever leave the device.
- Every player table has row-level security: a player can only ever read or change their own rows.
- Signed-out visitors have no access to player tables at all.
- Date of birth is fixed at sign-up; players can only edit their username, avatar and currency.
- Banned players are locked out of writing immediately, not just at their next sign-in.
- Every field a player can write has size and format limits, and each account has a row cap, so nobody can bloat the database.

**Admin panel**
- Invisible to everyone but the owner, and enforced in the database, not just the screen.
- Needs the owner's password plus a fresh authenticator-app code (under 12 hours old) for every admin action.
- Locks itself after 15 minutes idle. Every action is written to an audit log.

**Web app**
- Strict Content-Security-Policy with a fresh nonce on every page view: no script runs unless the server stamped it for that request. Data and media come only from CADNEX and its Supabase project, and the app can't be framed by other sites.
- HSTS, `nosniff`, a tight referrer policy, and camera, microphone, location and payment APIs switched off.
- The API routes validate every input before it reaches an upstream URL, and are rate-limited per visitor across all server instances. The money function and username checks have their own limits in the database.
- Team logos come through a locked-down proxy: ESPN logo folders only, raster images only, size-capped and sandboxed.
- No user-supplied HTML is ever rendered. Share links and notifications only open pages inside the app.
- Dependencies are kept on patched versions (`npm audit`: 0 known vulnerabilities at the last review).

## Reporting a problem

If you find a security issue, please email the owner privately rather than opening a public issue. You'll get a reply within a few days.
