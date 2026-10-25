// CADNEX money function.
// The code is bundled from src/money (scripts/build-money.mjs) and pinned to an exact commit,
// so what runs here is exactly what was reviewed and tested. It checks the caller's session
// itself (verify_jwt is off so the browser's CORS preflight can reach it).
import 'https://cdn.jsdelivr.net/gh/VasavDotJS/cadnex-bet@e0865738d6b270401a0def660dc017b5cdc989bf/supabase/functions/money/money.js';
