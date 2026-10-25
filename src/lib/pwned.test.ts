import { describe, expect, it } from 'vitest';
import { breachCount, passwordProblem } from './pwned';

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const fake = (body: string, seen: string[] = []) => (async (url: string) => {
  seen.push(url);
  return new Response(body, { status: 200 });
}) as unknown as typeof fetch;

describe('breached passwords', () => {
  it('sends only a 5-character hash prefix and matches the rest locally', async () => {
    const seen: string[] = [];
    const n = await breachCount('password', fake('0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n', seen));
    expect(n).toBe(9659365);
    expect(seen).toEqual(['https://api.pwnedpasswords.com/range/5BAA6']);
    expect(new URL(seen[0]).pathname).toBe('/range/5BAA6'); // the password itself never leaves the device
  });

  it('refuses breached, short, repetitive or personal passwords', async () => {
    expect(await passwordProblem('password', [], fake('1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365'))).toMatch(/thousands of data breaches/);
    expect(await passwordProblem('short', [], fake(''))).toMatch(/8 characters/);
    expect(await passwordProblem('aaaaaaaaaa', [], fake(''))).toMatch(/repeating/);
    expect(await passwordProblem('vasav-rocks-1', ['vasav'], fake(''))).toMatch(/username/);
    expect(await passwordProblem('another-pass-1', ['Vasav'], fake(''))).toBeNull();
    expect(await passwordProblem('abcpassword-9x', ['abc'], fake(''))).toBeNull(); // names under 4 letters aren't matched inside words
    expect(await passwordProblem('correct-horse-battery', ['vasav'], fake('ABCDEF:3'))).toBeNull();
  });

  it('never blocks sign-up when the service is down', async () => {
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await passwordProblem('correct-horse-battery', [], down)).toBeNull();
  });
});
