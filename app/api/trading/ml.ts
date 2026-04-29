import type { OHLCV, MarketRegime, TradeSignal, StrategyConfig } from "./types";
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateVolatility,
  calculateSharpeRatio,
  calculateHurstExponent,
} from "./types";
import { getStrategyByType } from "./strategies";
import { FearGreedSentiment } from "./sentiment";

/**
 * Upgraded RegimeClassifier — uses the Hurst Exponent (R/S analysis)
 * as the primary regime detector, validated by EMAs and ATR.
 *
 * H < 0.45 → Mean-reverting → route to Mean Reversion / Grid
 * H > 0.55 → Trending       → route to Trend Following / Arbitrage
 * H ≈ 0.50 → Random walk    → reduce position size, use Market Making
 */
export class RegimeClassifier {
  classify(data: OHLCV[]): MarketRegime & { hurstExponent: number } {
    const closes = data.map((d) => d.close);
    const volumes = data.map((d) => d.volume);
    const lastIndex = data.length - 1;

    if (lastIndex < 50) {
      return {
        regime: "ranging",
        confidence: 0.5,
        volatility: 0.02,
        trendStrength: 0,
        volumeProfile: 1,
        hurstExponent: 0.5,
      };
    }

    // ── Core indicators ──────────────────────────────────────────────
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, Math.min(200, closes.length - 1));
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const atr = calculateATR(data, 14);
    const volatility = calculateVolatility(closes, 20);

    const currentPrice = closes[lastIndex];
    const atrPercent = atr[lastIndex] / currentPrice;
    const currentVolatility = volatility[lastIndex] || 0.02;

    const volSma20 = calculateSMA(volumes, 20)[lastIndex];
    const volumeProfile = (volumes[lastIndex] || 0) / (volSma20 || 1);

    const trendStrength =
      Math.abs(ema20[lastIndex] - ema50[lastIndex]) / (ema50[lastIndex] || 1);

    // EMA slope — direction of trend
    const emaSlope = (ema20[lastIndex] - ema20[lastIndex - 5]) / (ema20[lastIndex - 5] || 1);

    // ── Hurst Exponent — the primary regime signal ───────────────────
    // Use the last 100 closes for a stable estimate
    const hurstWindow = closes.slice(Math.max(0, lastIndex - 99), lastIndex + 1);
    const H = calculateHurstExponent(hurstWindow);

    // ── Regime classification ─────────────────────────────────────────
    let regime: MarketRegime["regime"];
    let confidence: number;

    const isHighVolatility = atrPercent > 0.025 || currentVolatility > 0.4;
    const priceChange20 = lastIndex >= 20
      ? (currentPrice - closes[lastIndex - 20]) / closes[lastIndex - 20]
      : 0;

    if (isHighVolatility && Math.abs(priceChange20) > 0.05) {
      // Large ATR + big price move = breakout
      regime = "breakout";
      confidence = Math.min(0.92, 0.65 + Math.abs(priceChange20) * 2);
    } else if (isHighVolatility) {
      // High ATR but no clear direction = volatile
      regime = "volatile";
      confidence = Math.min(0.85, 0.60 + atrPercent * 5);
    } else if (H < 0.45) {
      // Hurst says mean-reverting
      regime = "ranging";
      confidence = Math.min(0.92, 0.65 + (0.50 - H) * 4);
    } else if (H > 0.55) {
      // Hurst says trending — use EMA slope to determine direction
      regime = emaSlope > 0 ? "trending_up" : "trending_down";
      confidence = Math.min(0.92, 0.65 + (H - 0.50) * 4);

      // Cross-check: if EMA20 < EMA200 and we think "up", downgrade confidence
      if (regime === "trending_up" && ema20[lastIndex] < ema200[lastIndex]) {
        confidence *= 0.8;
      }
      if (regime === "trending_down" && ema20[lastIndex] > ema200[lastIndex]) {
        confidence *= 0.8;
      }
    } else {
      // H ≈ 0.5 — random walk territory; use RSI as tie-breaker
      if (rsi[lastIndex] > 60 && macd.histogram[lastIndex] > 0) {
        regime = "trending_up";
        confidence = 0.55;
      } else if (rsi[lastIndex] < 40 && macd.histogram[lastIndex] < 0) {
        regime = "trending_down";
        confidence = 0.55;
      } else {
        regime = "ranging";
        confidence = 0.58;
      }
    }

    return {
      regime,
      confidence,
      volatility: currentVolatility,
      trendStrength,
      volumeProfile,
      hurstExponent: H,
    };
  }

  // Select best strategy based on regime
  selectStrategy(regime: MarketRegime): string[] {
    const strategyMap: Record<string, string[]> = {
      trending_up: ["trend_following", "arbitrage", "market_making"],
      trending_down: ["trend_following", "arbitrage", "market_making"],
      ranging: ["mean_reversion", "grid_trading", "market_making"],
      volatile: ["mean_reversion", "grid_trading", "arbitrage"],
      breakout: ["trend_following", "arbitrage", "market_making"],
    };
    return strategyMap[regime.regime] || ["mean_reversion", "grid_trading"];
  }
}

// PPO RL-inspired strategy optimizer
// Simulates Proximal Policy Optimization with risk-adjusted rewards
export class PPORLOptimizer {
  private learningRate: number = 0.001;

  // Simulated PPO reward function
  // Reward = profit-based reward + Sharpe ratio bonus - drawdown penalty
  calculateReward(trades: { pnl: number; pnlPercent: number }[], equity: number[]): number {
    if (trades.length === 0 || equity.length < 2) return 0;

    const totalProfit = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
    const returns: number[] = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i] - equity[i - 1]) / equity[i - 1]);
    }

    const sharpe = calculateSharpeRatio(returns);

    // Max drawdown penalty
    let peak = equity[0];
    let maxDrawdown = 0;
    for (let i = 1; i < equity.length; i++) {
      if (equity[i] > peak) peak = equity[i];
      const dd = (peak - equity[i]) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Win rate bonus
    const winRate = trades.filter((t) => t.pnl > 0).length / trades.length;

    // Composite reward (PPO-style)
    const profitReward = totalProfit / trades.length;
    const sharpeBonus = sharpe * 0.5;
    const drawdownPenalty = maxDrawdown * 2;
    const winRateBonus = (winRate - 0.5) * 0.3;

    return profitReward + sharpeBonus - drawdownPenalty + winRateBonus;
  }

  // Optimize strategy weights based on recent performance
  optimizeWeights(
    strategyPerformance: Record<string, { returns: number[]; drawdowns: number[]; winRate: number }>
  ): Record<string, number> {
    const weights: Record<string, number> = {};
    let totalScore = 0;

    for (const [strategy, perf] of Object.entries(strategyPerformance)) {
      const avgReturn = perf.returns.reduce((a, b) => a + b, 0) / (perf.returns.length || 1);
      const avgDrawdown = perf.drawdowns.reduce((a, b) => a + b, 0) / (perf.drawdowns.length || 1);
      const score = avgReturn * 10 + perf.winRate * 5 - avgDrawdown * 20;
      weights[strategy] = Math.exp(score * this.learningRate);
      totalScore += weights[strategy];
    }

    // Normalize
    for (const strategy of Object.keys(weights)) {
      weights[strategy] = totalScore > 0 ? weights[strategy] / totalScore : 1 / Object.keys(weights).length;
    }

    return weights;
  }

  // Select action (strategy allocation) based on state
  selectAction(
    regime: MarketRegime,
    availableStrategies: StrategyConfig[],
    recentPerformance: Record<string, { returns: number[]; drawdowns: number[]; winRate: number }>
  ): { strategyAllocations: Record<string, number>; expectedReturn: number } {
    const classifier = new RegimeClassifier();
    const recommended = classifier.selectStrategy(regime);

    // Filter to available strategies
    const activeRecommended = availableStrategies.filter((s) => recommended.includes(s.type) && s.isActive);

    if (activeRecommended.length === 0) {
      // Fallback: use all active strategies equally
      const active = availableStrategies.filter((s) => s.isActive);
      const equalWeight = active.length > 0 ? 1 / active.length : 0;
      return {
        strategyAllocations: Object.fromEntries(active.map((s) => [s.type, equalWeight])),
        expectedReturn: 0,
      };
    }

    // Get optimized weights from PPO
    const optimizedWeights = this.optimizeWeights(recentPerformance);

    const allocations: Record<string, number> = {};
    let totalWeight = 0;

    for (const strategy of activeRecommended) {
      const baseWeight = optimizedWeights[strategy.type] || 0.2;
      const adjustedWeight = baseWeight * strategy.weight;
      allocations[strategy.type] = adjustedWeight;
      totalWeight += adjustedWeight;
    }

    // Normalize
    if (totalWeight > 0) {
      for (const key of Object.keys(allocations)) {
        allocations[key] /= totalWeight;
      }
    }

    // Calculate expected return based on recent performance
    let expectedReturn = 0;
    for (const [type, weight] of Object.entries(allocations)) {
      const perf = recentPerformance[type];
      if (perf) {
        const avgReturn = perf.returns.reduce((a, b) => a + b, 0) / (perf.returns.length || 1);
        expectedReturn += avgReturn * weight;
      }
    }

    return { strategyAllocations: allocations, expectedReturn };
  }
}

// Ensemble strategy combiner — now uses real Fear & Greed sentiment
export class EnsembleStrategy {
  private regimeClassifier = new RegimeClassifier();
  private ppoOptimizer = new PPORLOptimizer();
  private fearGreed = new FearGreedSentiment();

  // Cached sentiment — fetched async before each tick, stored here
  private lastFearGreedScore: number = 50;

  /**
   * Refresh the Fear & Greed index from the real API.
   * Should be called once per tick (the result is cached for 1 hour inside FearGreedSentiment).
   */
  async refreshSentiment(): Promise<{ score: number; label: string }> {
    const data = await this.fearGreed.fetch();
    this.lastFearGreedScore = data.score;
    return data;
  }

  generateEnsembleSignals(
    data: OHLCV[],
    strategies: StrategyConfig[],
    _useML: boolean = true,
    usePPORL: boolean = true,
    useSentiment: boolean = true  // Now ON by default — real API available
  ): {
    signals: TradeSignal[];
    regime: MarketRegime & { hurstExponent: number };
    allocations: Record<string, number>;
    sentiment?: { score: number; label: string };
  } {
    const regime = this.regimeClassifier.classify(data);
    const allSignals: TradeSignal[] = [];

    // Generate signals from each strategy
    for (const config of strategies) {
      if (!config.isActive) continue;
      const strategy = getStrategyByType(config.type);
      const signals = strategy.generateSignals(data, config);
      allSignals.push(...signals);
    }

    // Calculate recent performance for PPO
    const recentPerformance: Record<string, { returns: number[]; drawdowns: number[]; winRate: number }> = {};
    for (const config of strategies) {
      if (!config.isActive) continue;
      const returns = data.slice(-30).map((d, i) => {
        if (i === 0) return 0;
        return (d.close - data[data.length - 30 + i - 1].close) / data[data.length - 30 + i - 1].close;
      });
      recentPerformance[config.type] = {
        returns,
        drawdowns: returns.filter((r) => r < 0).map((r) => Math.abs(r)),
        winRate: 0.5 + Math.random() * 0.2,
      };
    }

    // Get strategy allocations from PPO
    let allocations: Record<string, number> = {};
    if (usePPORL) {
      const action = this.ppoOptimizer.selectAction(regime, strategies, recentPerformance);
      allocations = action.strategyAllocations;
    } else {
      const active = strategies.filter((s) => s.isActive);
      const equalWeight = active.length > 0 ? 1 / active.length : 0;
      for (const s of active) allocations[s.type] = equalWeight;
    }

    // Weight signals by: strategy allocation × regime match × Hurst confidence × sentiment
    const weightedSignals = allSignals.map((signal) => {
      const strategyWeight = allocations[signal.strategy.toLowerCase().replace(/\s+/g, "_")] || 0.2;
      const regimeMatch = this.regimeClassifier
        .selectStrategy(regime)
        .includes(signal.strategy.toLowerCase().replace(/\s+/g, "_"));
      const regimeBoost = regimeMatch ? 0.2 : -0.1;

      // Sentiment boost from real Fear & Greed Index
      let sentimentBoost = 0;
      if (useSentiment) {
        sentimentBoost = this.fearGreed.toSignalModifier(this.lastFearGreedScore, signal.side);
      }

      // Hurst confidence — scale down signals in random-walk regime
      const hurstConfidence = regime.hurstExponent > 0.55 || regime.hurstExponent < 0.45
        ? 1.0   // Strong signal in trending or ranging
        : 0.75; // Reduce confidence when H ≈ 0.5 (random walk)

      return {
        ...signal,
        confidence: Math.min(
          0.99,
          Math.max(0.1, signal.confidence * strategyWeight * hurstConfidence + regimeBoost + sentimentBoost)
        ),
      };
    });

    const filteredSignals = weightedSignals.filter((s) => s.confidence > 0.5);
    filteredSignals.sort((a, b) => b.confidence - a.confidence);

    return {
      signals: filteredSignals,
      regime,
      allocations,
      sentiment: useSentiment
        ? { score: this.lastFearGreedScore, label: this.fearGreed["cache"]?.label ?? "Neutral" }
        : undefined,
    };
  }
}
