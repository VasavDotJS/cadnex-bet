// CADNEX money function.
// The code is bundled from src/money (scripts/build-money.mjs) and pinned to an exact commit,
// so what runs here is exactly what was reviewed and tested. It checks the caller's session
// itself (verify_jwt is off so the browser's CORS preflight can reach it).
import 'https://cdn.jsdelivr.net/gh/VasavDotJS/cadnex-bet@aa29e86380f7413c725e33fb259efe0a843f7c55/supabase/functions/money/money.js';
