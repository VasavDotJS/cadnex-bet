/** Sides that aren't a real player or team yet: draws often list "TBD" or "Qualifier" until a round finishes. */
const PLACEHOLDER = /^(tbd|tba|bye|qualifier|winner of|loser of|to be (decided|announced)|unknown|n\/?a)\b/i;

export function isPlaceholderName(name: string | undefined | null): boolean {
  const n = (name ?? '').trim();
  return !n || n === '?' || PLACEHOLDER.test(n);
}

/** True when either side of a match isn't known yet; such matches take no bets. */
export function undecidedSides(ev: { home: { name: string }; away: { name: string } }): boolean {
  return isPlaceholderName(ev.home.name) || isPlaceholderName(ev.away.name);
}
