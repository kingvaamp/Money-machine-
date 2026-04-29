import type { OHLCV, TradeSignal, StrategyConfig } from "./types";
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD, calculateBollingerBands, calculateATR } from "./types";

export abstract class TradingStrategy {
  abstract name: string;
  abstract generateSignals(data: OHLCV[], config: StrategyConfig): TradeSignal[];
}

export class TrendFollowingStrategy extends TradingStrategy {
  name = "Trend Following";

  generateSignals(data: OHLCV[], config: StrategyConfig): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const closes = data.map((d) => d.close);
    const fastPeriod = (config.parameters.fastPeriod as number) || 20;
    const slowPeriod = (config.parameters.slowPeriod as number) || 50;
    const rsiPeriod = (config.parameters.rsiPeriod as number) || 14;
    const rsiOverbought = (config.parameters.rsiOverbought as number) || 70;
    const rsiOversold = (config.parameters.rsiOversold as number) || 30;

    const emaFast = calculateEMA(closes, fastPeriod);
    const emaSlow = calculateEMA(closes, slowPeriod);
    const rsi = calculateRSI(closes, rsiPeriod);
    const macd = calculateMACD(closes, 12, 26, 9);

    const lastIndex = data.length - 1;
    if (lastIndex < slowPeriod + 5) return signals;

    const currentPrice = closes[lastIndex];

    // Bullish: Fast EMA crosses above Slow EMA, RSI not overbought, MACD histogram positive
    const bullishCrossover =
      emaFast[lastIndex] > emaSlow[lastIndex] &&
      emaFast[lastIndex - 1] <= emaSlow[lastIndex - 1];

    const bearishCrossover =
      emaFast[lastIndex] < emaSlow[lastIndex] &&
      emaFast[lastIndex - 1] >= emaSlow[lastIndex - 1];

    const trendStrength = Math.abs(emaFast[lastIndex] - emaSlow[lastIndex]) / emaSlow[lastIndex];
    const macdConfirm = macd.histogram[lastIndex] > 0;

    if (bullishCrossover && rsi[lastIndex] < rsiOverbought && macdConfirm) {
      signals.push({
        symbol: config.symbol,
        side: "buy",
        type: "entry",
        confidence: Math.min(0.95, 0.6 + trendStrength * 10 + rsi[lastIndex] / 200),
        price: currentPrice,
        strategy: this.name,
        indicators: {
          emaFast: emaFast[lastIndex],
          emaSlow: emaSlow[lastIndex],
          rsi: rsi[lastIndex],
          macd: macd.macd[lastIndex],
          trendStrength,
        },
      });
    }

    if (bearishCrossover && rsi[lastIndex] > rsiOversold) {
      signals.push({
        symbol: config.symbol,
        side: "sell",
        type: "exit",
        confidence: Math.min(0.95, 0.6 + trendStrength * 10 + (100 - rsi[lastIndex]) / 200),
        price: currentPrice,
        strategy: this.name,
        indicators: {
          emaFast: emaFast[lastIndex],
          emaSlow: emaSlow[lastIndex],
          rsi: rsi[lastIndex],
          macd: macd.macd[lastIndex],
          trendStrength,
        },
      });
    }

    return signals;
  }
}

export class MeanReversionStrategy extends TradingStrategy {
  name = "Mean Reversion";

  generateSignals(data: OHLCV[], config: StrategyConfig): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const closes = data.map((d) => d.close);
    const period = (config.parameters.bbPeriod as number) || 20;
    const stdDev = (config.parameters.bbStdDev as number) || 2;
    const rsiPeriod = (config.parameters.rsiPeriod as number) || 14;

    const bb = calculateBollingerBands(closes, period, stdDev);
    const rsi = calculateRSI(closes, rsiPeriod);
    const atr = calculateATR(data, 14);

    const lastIndex = data.length - 1;
    if (lastIndex < period + 5) return signals;

    const currentPrice = closes[lastIndex];
    const pricePosition = (currentPrice - bb.lower[lastIndex]) / (bb.upper[lastIndex] - bb.lower[lastIndex]);

    // Oversold: Price near lower band + RSI oversold
    if (currentPrice <= bb.lower[lastIndex] * 1.01 && rsi[lastIndex] < 30) {
      const confidence = Math.min(0.95, 0.7 + (30 - rsi[lastIndex]) / 100 + (1 - pricePosition) * 0.2);
      signals.push({
        symbol: config.symbol,
        side: "buy",
        type: "entry",
        confidence,
        price: currentPrice,
        strategy: this.name,
        indicators: {
          lowerBand: bb.lower[lastIndex],
          upperBand: bb.upper[lastIndex],
          middleBand: bb.middle[lastIndex],
          rsi: rsi[lastIndex],
          pricePosition,
          atr: atr[lastIndex],
        },
      });
    }

    // Overbought: Price near upper band + RSI overbought
    if (currentPrice >= bb.upper[lastIndex] * 0.99 && rsi[lastIndex] > 70) {
      const confidence = Math.min(0.95, 0.7 + (rsi[lastIndex] - 70) / 100 + pricePosition * 0.2);
      signals.push({
        symbol: config.symbol,
        side: "sell",
        type: "entry",
        confidence,
        price: currentPrice,
        strategy: this.name,
        indicators: {
          lowerBand: bb.lower[lastIndex],
          upperBand: bb.upper[lastIndex],
          middleBand: bb.middle[lastIndex],
          rsi: rsi[lastIndex],
          pricePosition,
          atr: atr[lastIndex],
        },
      });
    }

    return signals;
  }
}

export class GridTradingStrategy extends TradingStrategy {
  name = "Grid Trading";

  generateSignals(data: OHLCV[], config: StrategyConfig): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const closes = data.map((d) => d.close);
    const gridLevels = (config.parameters.gridLevels as number) || 10;
    const gridRange = (config.parameters.gridRange as number) || 0.05;
    const atr = calculateATR(data, 14);

    const lastIndex = data.length - 1;
    if (lastIndex < 20) return signals;

    const currentPrice = closes[lastIndex];
    const sma50 = calculateSMA(closes, 50)[lastIndex];
    const range = sma50 * gridRange;
    const gridSize = range / gridLevels;

    // Calculate nearest grid levels
    const gridCenter = Math.round(sma50 / gridSize) * gridSize;
    const lowerLevels: number[] = [];
    const upperLevels: number[] = [];

    for (let i = 1; i <= gridLevels / 2; i++) {
      lowerLevels.push(gridCenter - i * gridSize);
      upperLevels.push(gridCenter + i * gridSize);
    }

    // Check if price is near a grid level for entry
    for (const level of lowerLevels) {
      if (Math.abs(currentPrice - level) / level < 0.002) {
        signals.push({
          symbol: config.symbol,
          side: "buy",
          type: "grid_entry",
          confidence: 0.75,
          price: currentPrice,
          strategy: this.name,
          indicators: {
            gridLevel: level,
            sma50,
            atr: atr[lastIndex],
            gridSize,
          },
        });
        break;
      }
    }

    for (const level of upperLevels) {
      if (Math.abs(currentPrice - level) / level < 0.002) {
        signals.push({
          symbol: config.symbol,
          side: "sell",
          type: "grid_exit",
          confidence: 0.75,
          price: currentPrice,
          strategy: this.name,
          indicators: {
            gridLevel: level,
            sma50,
            atr: atr[lastIndex],
            gridSize,
          },
        });
        break;
      }
    }

    return signals;
  }
}

export class ArbitrageStrategy extends TradingStrategy {
  name = "Arbitrage";

  generateSignals(data: OHLCV[], config: StrategyConfig): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const closes = data.map((d) => d.close);
    const lookback = (config.parameters.lookback as number) || 20;
    const threshold = (config.parameters.threshold as number) || 0.003;

    const lastIndex = data.length - 1;
    if (lastIndex < lookback + 5) return signals;

    const currentPrice = closes[lastIndex];
    const sma = calculateSMA(closes, lookback)[lastIndex];
    const deviation = (currentPrice - sma) / sma;

    // Statistical arbitrage: price deviates significantly from mean
    if (Math.abs(deviation) > threshold) {
      const confidence = Math.min(0.95, 0.6 + Math.abs(deviation) * 50);
      signals.push({
        symbol: config.symbol,
        side: deviation > 0 ? "sell" : "buy",
        type: deviation > 0 ? "exit" : "entry",
        confidence,
        price: currentPrice,
        strategy: this.name,
        indicators: {
          sma,
          deviation,
          threshold,
          lookback,
        },
      });
    }

    return signals;
  }
}

export class MarketMakingStrategy extends TradingStrategy {
  name = "Market Making";

  generateSignals(data: OHLCV[], config: StrategyConfig): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const closes = data.map((d) => d.close);
    const spread = (config.parameters.spread as number) || 0.001;
    const depth = (config.parameters.depth as number) || 3;
    const atr = calculateATR(data, 14);

    const lastIndex = data.length - 1;
    if (lastIndex < 20) return signals;

    const currentPrice = closes[lastIndex];
    const currentATR = atr[lastIndex];
    const volatility = currentATR / currentPrice;

    // Adjust spread based on volatility
    const dynamicSpread = spread * (1 + volatility * 10);

    for (let i = 1; i <= depth; i++) {
      const bidPrice = currentPrice * (1 - dynamicSpread * i);
      const askPrice = currentPrice * (1 + dynamicSpread * i);

      signals.push({
        symbol: config.symbol,
        side: "buy",
        type: "grid_entry",
        confidence: 0.8 - i * 0.05,
        price: bidPrice,
        strategy: this.name,
        indicators: {
          bidPrice,
          askPrice,
          spread: dynamicSpread,
          depth: i,
          volatility,
          atr: currentATR,
        },
      });

      signals.push({
        symbol: config.symbol,
        side: "sell",
        type: "grid_exit",
        confidence: 0.8 - i * 0.05,
        price: askPrice,
        strategy: this.name,
        indicators: {
          bidPrice,
          askPrice,
          spread: dynamicSpread,
          depth: i,
          volatility,
          atr: currentATR,
        },
      });
    }

    return signals;
  }
}

export function getStrategyByType(type: string): TradingStrategy {
  switch (type) {
    case "trend_following":
      return new TrendFollowingStrategy();
    case "mean_reversion":
      return new MeanReversionStrategy();
    case "grid_trading":
      return new GridTradingStrategy();
    case "arbitrage":
      return new ArbitrageStrategy();
    case "market_making":
      return new MarketMakingStrategy();
    default:
      return new TrendFollowingStrategy();
  }
}
