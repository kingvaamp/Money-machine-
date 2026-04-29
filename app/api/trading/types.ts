export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeSignal {
  symbol: string;
  side: "buy" | "sell";
  type: "entry" | "exit" | "grid_entry" | "grid_exit";
  confidence: number;
  price: number;
  quantity?: number;
  strategy: string;
  indicators?: Record<string, number>;
  regime?: string;
}

export interface MarketRegime {
  regime: "trending_up" | "trending_down" | "ranging" | "volatile" | "breakout";
  confidence: number;
  volatility: number;
  trendStrength: number;
  volumeProfile: number;
}

export interface Position {
  id: number;
  strategyId: number;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
  openedAt: Date;
  stopLoss?: number;
  takeProfit?: number;
  stopLossMoved?: boolean;
  trailingStop?: number;
}

export interface BacktestResult {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  avgTradeReturn: number;
  volatility: number;
  equityCurve: { timestamp: number; equity: number }[];
  trades: SimulatedTrade[];
  monthlyReturns: { month: string; return: number }[];
}

export interface SimulatedTrade {
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  side: "buy" | "sell";
  pnl: number;
  pnlPercent: number;
  entryAt: number;
  exitAt?: number;
  exitReason?: string;
}

export interface RiskConfig {
  maxDailyLoss: number;
  maxPositionSize: number;
  maxOpenPositions: number;
  defaultStopLoss: number;
  defaultTakeProfit: number;
  riskPerTrade: number;
  capital: number;
}

export interface StrategyConfig {
  id: number;
  name: string;
  type: string;
  symbol: string;
  timeframe: string;
  parameters: Record<string, number | boolean | string>;
  weight: number;
  isActive: boolean;
}

export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  return result;
}

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = data[0];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema = data[i];
    } else {
      ema = data[i] * multiplier + ema * (1 - multiplier);
    }
    result.push(ema);
  }
  return result;
}

export function calculateRSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(50);
      continue;
    }
    if (i > period) {
      const change = data[i] - data[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push(Math.min(100, Math.max(0, rsi)));
  }
  return result;
}

export function calculateATR(ohlcv: OHLCV[], period: number = 14): number[] {
  const result: number[] = [];
  let atr = 0;

  for (let i = 0; i < ohlcv.length; i++) {
    if (i === 0) {
      result.push(ohlcv[i].high - ohlcv[i].low);
      continue;
    }
    const tr1 = ohlcv[i].high - ohlcv[i].low;
    const tr2 = Math.abs(ohlcv[i].high - ohlcv[i - 1].close);
    const tr3 = Math.abs(ohlcv[i].low - ohlcv[i - 1].close);
    const trueRange = Math.max(tr1, tr2, tr3);

    if (i < period) {
      atr += trueRange / period;
      result.push(atr || trueRange);
    } else {
      if (i === period) {
        atr = (atr * (period - 1) + trueRange) / period;
      } else {
        atr = (atr * (period - 1) + trueRange) / period;
      }
      result.push(atr);
    }
  }
  return result;
}

export function calculateBollingerBands(
  data: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += Math.pow(data[i - j] - middle[i], 2);
    }
    const sd = Math.sqrt(sum / period);
    upper.push(middle[i] + stdDev * sd);
    lower.push(middle[i] - stdDev * sd);
  }

  return { upper, middle, lower };
}

export function calculateMACD(
  data: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macd: number[] = [];

  for (let i = 0; i < data.length; i++) {
    macd.push(emaFast[i] - emaSlow[i]);
  }

  const signalLine = calculateEMA(macd, signal);
  const histogram: number[] = [];

  for (let i = 0; i < data.length; i++) {
    histogram.push(macd[i] - signalLine[i]);
  }

  return { macd, signal: signalLine, histogram };
}

export function calculateVolatility(data: number[], period: number = 20): number[] {
  const result: number[] = [];
  const returns: number[] = [];

  for (let i = 1; i < data.length; i++) {
    returns.push((data[i] - data[i - 1]) / data[i - 1]);
  }

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(0);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += returns[i - j - 1];
    }
    const avg = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += Math.pow(returns[i - j - 1] - avg, 2);
    }
    result.push(Math.sqrt(variance / period) * Math.sqrt(252));
  }
  return result;
}

export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  return std === 0 ? 0 : (avg - riskFreeRate / 252) / std * Math.sqrt(252);
}

/**
 * Hurst Exponent — statistically validates market regime.
 *
 * H < 0.45 → Mean-reverting (use Mean Reversion / Grid strategies)
 * H > 0.55 → Trending (use Trend Following / Arbitrage strategies)
 * H ≈ 0.5  → Random walk (reduce size, use cautious strategies)
 *
 * Uses the Rescaled Range (R/S) method.
 * Requires at least 100 price points for reliable output.
 */
export function calculateHurstExponent(prices: number[]): number {
  if (prices.length < 20) return 0.5; // Insufficient data — assume random

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const n = returns.length;
  const lags = [2, 4, 8, 16, 32, 64].filter((l) => l < n / 2);
  const rsValues: number[] = [];

  for (const lag of lags) {
    const chunks: number[][] = [];
    for (let i = 0; i + lag <= n; i += lag) {
      chunks.push(returns.slice(i, i + lag));
    }

    const rsPerChunk: number[] = [];
    for (const chunk of chunks) {
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      const deviations = chunk.map((x) => x - mean);
      const cumDev: number[] = [];
      let cum = 0;
      for (const d of deviations) {
        cum += d;
        cumDev.push(cum);
      }
      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const variance = deviations.reduce((s, d) => s + d * d, 0) / chunk.length;
      const S = Math.sqrt(variance);
      if (S > 0) rsPerChunk.push(R / S);
    }

    if (rsPerChunk.length > 0) {
      rsValues.push(rsPerChunk.reduce((a, b) => a + b, 0) / rsPerChunk.length);
    }
  }

  if (rsValues.length < 2) return 0.5;

  // Linear regression of log(RS) vs log(lag) to estimate H
  const logLags = lags.slice(0, rsValues.length).map(Math.log);
  const logRS = rsValues.map(Math.log);
  const n2 = logLags.length;
  const sumX = logLags.reduce((a, b) => a + b, 0);
  const sumY = logRS.reduce((a, b) => a + b, 0);
  const sumXY = logLags.reduce((s, x, i) => s + x * logRS[i], 0);
  const sumX2 = logLags.reduce((s, x) => s + x * x, 0);
  const slope = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX);

  // Clamp to [0.1, 0.9] to avoid numerical extremes
  return Math.max(0.1, Math.min(0.9, slope));
}


export function calculateMaxDrawdown(equity: number[]): { maxDrawdown: number; peak: number; trough: number } {
  let peak = equity[0];
  let maxDrawdown = 0;
  let trough = equity[0];

  for (let i = 1; i < equity.length; i++) {
    if (equity[i] > peak) {
      peak = equity[i];
    }
    const drawdown = (peak - equity[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      trough = equity[i];
    }
  }

  return { maxDrawdown, peak, trough };
}

export function generateSyntheticData(
  _symbol: string,
  days: number = 500,
  startPrice: number = 50000,
  volatility: number = 0.02
): OHLCV[] {
  const data: OHLCV[] = [];
  let price = startPrice;
  const now = Date.now();

  for (let i = days; i >= 0; i--) {
    const trend = Math.sin(i / 50) * 0.001;
    const noise = (Math.random() - 0.5) * volatility;
    const change = trend + noise;

    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = 1000 + Math.random() * 5000;

    data.push({
      timestamp: now - i * 24 * 60 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return data;
}
