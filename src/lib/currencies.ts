/**
 * Supported currencies. `usd` is the bundled static demo FX rate: units of this
 * currency per 1 USD. These are demo figures, not live rates.
 */
export interface Currency {
  code: string;
  name: string;
  decimals: number;
  symbol: string;
  glyph: string; // flag emoji or coin mark shown in the icon well
  kind: 'fiat' | 'crypto';
  usd: number;
}

const f = (code: string, name: string, decimals: number, symbol: string, glyph: string, usd: number): Currency => ({ code, name, decimals, symbol, glyph, kind: 'fiat', usd });
const c = (code: string, name: string, decimals: number, symbol: string, glyph: string, usd: number): Currency => ({ code, name, decimals, symbol, glyph, kind: 'crypto', usd });

export const CURRENCIES: Currency[] = [
  f('USD', 'US Dollar', 2, '$', '🇺🇸', 1),
  f('EUR', 'Euro', 2, '€', '🇪🇺', 0.92),
  f('GBP', 'British Pound', 2, '£', '🇬🇧', 0.78),
  f('INR', 'Indian Rupee', 2, '₹', '🇮🇳', 84.2),
  f('JPY', 'Japanese Yen', 0, '¥', '🇯🇵', 151),
  f('CNY', 'Chinese Yuan', 2, '¥', '🇨🇳', 7.2),
  f('AUD', 'Australian Dollar', 2, 'A$', '🇦🇺', 1.52),
  f('CAD', 'Canadian Dollar', 2, 'C$', '🇨🇦', 1.37),
  f('CHF', 'Swiss Franc', 2, 'CHF', '🇨🇭', 0.86),
  f('SEK', 'Swedish Krona', 2, 'kr', '🇸🇪', 10.6),
  f('NOK', 'Norwegian Krone', 2, 'kr', '🇳🇴', 10.9),
  f('DKK', 'Danish Krone', 2, 'kr', '🇩🇰', 6.85),
  f('NZD', 'New Zealand Dollar', 2, 'NZ$', '🇳🇿', 1.66),
  f('SGD', 'Singapore Dollar', 2, 'S$', '🇸🇬', 1.33),
  f('HKD', 'Hong Kong Dollar', 2, 'HK$', '🇭🇰', 7.79),
  f('KRW', 'South Korean Won', 0, '₩', '🇰🇷', 1360),
  f('BRL', 'Brazilian Real', 2, 'R$', '🇧🇷', 5.55),
  f('MXN', 'Mexican Peso', 2, 'MX$', '🇲🇽', 19.4),
  f('ARS', 'Argentine Peso', 2, 'AR$', '🇦🇷', 980),
  f('CLP', 'Chilean Peso', 0, 'CLP$', '🇨🇱', 935),
  f('COP', 'Colombian Peso', 2, 'COL$', '🇨🇴', 4150),
  f('PEN', 'Peruvian Sol', 2, 'S/', '🇵🇪', 3.75),
  f('ZAR', 'South African Rand', 2, 'R', '🇿🇦', 17.8),
  f('NGN', 'Nigerian Naira', 2, '₦', '🇳🇬', 1600),
  f('KES', 'Kenyan Shilling', 2, 'KSh', '🇰🇪', 129),
  f('EGP', 'Egyptian Pound', 2, 'E£', '🇪🇬', 48.5),
  f('TRY', 'Turkish Lira', 2, '₺', '🇹🇷', 34.2),
  f('AED', 'UAE Dirham', 2, 'AED', '🇦🇪', 3.6725),
  f('SAR', 'Saudi Riyal', 2, 'SAR', '🇸🇦', 3.75),
  f('QAR', 'Qatari Riyal', 2, 'QAR', '🇶🇦', 3.64),
  f('KWD', 'Kuwaiti Dinar', 3, 'KD', '🇰🇼', 0.307),
  f('PKR', 'Pakistani Rupee', 2, '₨', '🇵🇰', 278),
  f('BDT', 'Bangladeshi Taka', 2, '৳', '🇧🇩', 120),
  f('LKR', 'Sri Lankan Rupee', 2, 'Rs', '🇱🇰', 295),
  f('NPR', 'Nepalese Rupee', 2, 'Rs', '🇳🇵', 134.7),
  f('IDR', 'Indonesian Rupiah', 2, 'Rp', '🇮🇩', 15700),
  f('MYR', 'Malaysian Ringgit', 2, 'RM', '🇲🇾', 4.4),
  f('THB', 'Thai Baht', 2, '฿', '🇹🇭', 34.5),
  f('PHP', 'Philippine Peso', 2, '₱', '🇵🇭', 57.5),
  f('VND', 'Vietnamese Dong', 0, '₫', '🇻🇳', 25300),
  f('PLN', 'Polish Złoty', 2, 'zł', '🇵🇱', 3.98),
  f('CZK', 'Czech Koruna', 2, 'Kč', '🇨🇿', 23.2),
  f('HUF', 'Hungarian Forint', 2, 'Ft', '🇭🇺', 365),
  f('RON', 'Romanian Leu', 2, 'lei', '🇷🇴', 4.58),
  f('ILS', 'Israeli Shekel', 2, '₪', '🇮🇱', 3.72),
  f('UAH', 'Ukrainian Hryvnia', 2, '₴', '🇺🇦', 41.3),
  c('BTC', 'Bitcoin', 8, '₿', '₿', 1 / 68000),
  c('ETH', 'Ether', 8, 'Ξ', 'Ξ', 1 / 3300),
  c('USDT', 'Tether', 2, '₮', '₮', 1),
  c('USDC', 'USD Coin', 2, 'USDC', '◎', 1),
  c('SOL', 'Solana', 6, 'SOL', '◈', 1 / 165),
  c('LTC', 'Litecoin', 8, 'Ł', 'Ł', 1 / 82),
  c('DOGE', 'Dogecoin', 4, 'Ð', 'Ð', 1 / 0.16),
  c('BNB', 'BNB', 6, 'BNB', '◆', 1 / 590),
  c('XRP', 'XRP', 4, 'XRP', '✕', 1 / 0.55),
  c('TRX', 'TRON', 4, 'TRX', '▲', 1 / 0.16),
];

const BY_CODE = new Map(CURRENCIES.map((x) => [x.code, x]));

export function currency(code: string): Currency {
  const cur = BY_CODE.get(code);
  if (!cur) throw new Error(`Unknown currency ${code}`);
  return cur;
}

export function isCurrency(code: string): boolean {
  return BY_CODE.has(code);
}
