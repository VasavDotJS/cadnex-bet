/** Calls the `money` Edge Function as the signed-in player. */
import { MoneyCall, MoneyError, MoneyResult } from '../money/remote';
import { cloud } from './client';

export const callMoney: MoneyCall = async (action, body) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new MoneyError({ code: 'OFFLINE', message: 'You’re offline. Connect to the internet and try again.' });
  const { data, error } = await cloud().functions.invoke('money', { body: { ...body, action } });
  let reply = data as (MoneyResult & { ok: true }) | { ok: false; code: string; message: string; prices?: Record<string, number> } | null;
  if (error) {
    // non-2xx answers still carry our JSON (auth, rate limit, server error)
    const res = (error as { context?: Response }).context;
    try {
      reply = res ? await res.json() : null;
    } catch {
      reply = null;
    }
    if (!reply) throw new MoneyError({ code: 'NETWORK', message: 'Couldn’t reach CADNEX. Check your connection and try again.' });
  }
  if (!reply) throw new MoneyError({ code: 'NETWORK', message: 'Couldn’t reach CADNEX. Try again.' });
  if (!reply.ok) throw new MoneyError({ code: reply.code, message: reply.message, prices: reply.prices });
  return reply;
};
