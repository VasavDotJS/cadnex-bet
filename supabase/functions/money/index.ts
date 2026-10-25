// CADNEX money function.
// The code is bundled from src/money (scripts/build-money.mjs) and pinned to an exact commit,
// so what runs here is exactly what was reviewed and tested. It checks the caller's session
// itself (verify_jwt is off so the browser's CORS preflight can reach it).
import 'https://cdn.jsdelivr.net/gh/VasavDotJS/cadnex-bet@6bd67be575c0a4c1f6beabd6dc08001a7db3c53c/supabase/functions/money/money.js';
