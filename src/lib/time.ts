/** Strictly increasing timestamps so ledger rows written in the same millisecond keep their order. */
let last = 0;
export function stamp(): number {
  const n = Date.now();
  last = n > last ? n : last + 1;
  return last;
}
