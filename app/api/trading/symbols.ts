// Supported trading pairs — expand freely
export const SUPPORTED_SYMBOLS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "ADA/USDT",
  "AVAX/USDT",
  "DOGE/USDT",
  "DOT/USDT",
  "LINK/USDT",
  "MATIC/USDT",
  "UNI/USDT",
] as const;

export type SupportedSymbol = (typeof SUPPORTED_SYMBOLS)[number];

// Supported timeframes
export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

// Binance symbol format for API calls (e.g. "BTC/USDT" → "BTCUSDT")
export function toBinanceSymbol(ccxtSymbol: string): string {
  return ccxtSymbol.replace("/", "");
}

// CCXT symbol format from Binance (e.g. "BTCUSDT" → "BTC/USDT")
export function toCCXTSymbol(binanceSymbol: string): string {
  if (binanceSymbol.includes("/")) return binanceSymbol;
  const quote = ["USDT", "BTC", "ETH", "BNB"].find((q) => binanceSymbol.endsWith(q));
  if (!quote) return binanceSymbol;
  return `${binanceSymbol.slice(0, -quote.length)}/${quote}`;
}
