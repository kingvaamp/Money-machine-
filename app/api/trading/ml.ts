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

// ─── ML Model Client ──────────────────────────────────────────────────────────
// Connects to the Python FastAPI model server (data-pipeline/model_server.py).
// Gracefully degrades if the server is offline — bot continues rule-based.

export interface MLPrediction {
  prediction: "UP" | "DOWN";
  confidence: number;     // 0.5–1.0 calibrated probability
  strongSignal: boolean;  // confidence > 0.72
  sitOut: boolean;        // true when model is uncertain (skip trading)
  online: boolean;        // false if server unreachable
}

export class MLModelClient {
  private baseUrl: string;
  private timeoutMs: number;
  private lastPrediction: MLPrediction | null = null;
  private lastPredictionTime: number = 0;
  private cacheTtlMs: number = 60_000; // Cache predictions for 1 minute

  constructor(baseUrl = "http://127.0.0.1:8000", timeoutMs = 3000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Fetch a prediction from the Python ML server.
   * Returns a cached result if within TTL to avoid hammering the server.
   * Returns offline fallback if server is unreachable.
   */
  async predict(candles: OHLCV[]): Promise<MLPrediction> {
    const now = Date.now();

    // Serve from cache within TTL
    if (this.lastPrediction && now - this.lastPredictionTime < this.cacheTtlMs) {
      return this.lastPrediction;
    }

    // Need at least 250 candles for feature engineering
    if (candles.length < 250) {
      return { prediction: "UP", confidence: 0.5, strongSignal: false, sitOut: true, online: false };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.baseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candles: candles.slice(-500).map((c) => ({
            timestamp: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        prediction: "UP" | "DOWN";
        confidence: number;
        strong_signal: boolean;
        sit_out: boolean;
      };

      this.lastPrediction = {
        prediction: data.prediction,
        confidence: data.confidence,
        strongSignal: data.strong_signal,
        sitOut: data.sit_out,
        online: true,
      };
      this.lastPredictionTime = now;
      return this.lastPrediction;

    } catch {
      // Server offline — degrade gracefully, do not crash the engine
      return { prediction: "UP", confidence: 0.5, strongSignal: false, sitOut: true, online: false };
    }
  }
}

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

// Ensemble strategy combiner — real ML gating + real PPO win rates
export class EnsembleStrategy {
  private regimeClassifier = new RegimeClassifier();
  private ppoOptimizer = new PPORLOptimizer();
  private fearGreed = new FearGreedSentiment();

  // Injected by the engine on each tick with real trade history
  private mlPrediction: MLPrediction | null = null;

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

  /**
   * Inject the latest ML prediction from the Python model server.
   * Called by TradingEngine.tick() before generateEnsembleSignals().
   */
  setMLPrediction(prediction: MLPrediction | null) {
    this.mlPrediction = prediction;
  }

  /**
   * Build real per-strategy performance from actual closed trade history.
   * FIX: Replaces the Math.random() win rate placeholder.
   */
  private buildRealPerformance(
    strategies: StrategyConfig[],
    tradeHistory: Array<{ side: "buy" | "sell"; pnl: number; strategy?: string }>,
    data: OHLCV[]
  ): Record<string, { returns: number[]; drawdowns: number[]; winRate: number }> {
    const perf: Record<string, { returns: number[]; drawdowns: number[]; winRate: number }> = {};

    for (const config of strategies) {
      if (!config.isActive) continue;

      // Filter the last 50 closed trades for this strategy type
      const stratTrades = tradeHistory
        .filter((t) => !t.strategy || t.strategy.toLowerCase().replace(/\s+/g, "_") === config.type)
        .slice(-50);

      if (stratTrades.length >= 5) {
        // Real win rate from actual trades
        const wins = stratTrades.filter((t) => t.pnl > 0).length;
        const realWinRate = wins / stratTrades.length;
        const returns = stratTrades.map((t) => t.pnl > 0 ? 0.01 : -0.005); // Simplified return proxy
        const drawdowns = returns.filter((r) => r < 0).map((r) => Math.abs(r));
        perf[config.type] = { returns, drawdowns, winRate: realWinRate };
      } else {
        // Not enough real data yet — use market returns (neutral)
        const marketReturns = data.slice(-30).map((d, i) => {
          if (i === 0) return 0;
          return (d.close - data[data.length - 30 + i - 1].close) / (data[data.length - 30 + i - 1].close || 1);
        });
        perf[config.type] = {
          returns: marketReturns,
          drawdowns: marketReturns.filter((r) => r < 0).map((r) => Math.abs(r)),
          winRate: 0.50, // Neutral default — not random
        };
      }
    }
    return perf;
  }

  generateEnsembleSignals(
    data: OHLCV[],
    strategies: StrategyConfig[],
    useML: boolean = true,
    usePPORL: boolean = true,
    useSentiment: boolean = true,
    tradeHistory: Array<{ side: "buy" | "sell"; pnl: number; strategy?: string }> = []
  ): {
    signals: TradeSignal[];
    regime: MarketRegime & { hurstExponent: number };
    allocations: Record<string, number>;
    sentiment?: { score: number; label: string };
    mlPrediction?: MLPrediction;
  } {
    const regime = this.regimeClassifier.classify(data);

    // ── ML GATE (Problem 1 Fix) ────────────────────────────────────────────
    // If ML model is online and says sit out → return empty signals immediately.
    // This is the core profitability gate: don't trade when uncertain.
    const ml = useML ? this.mlPrediction : null;
    if (ml?.online && ml.sitOut) {
      return {
        signals: [],
        regime,
        allocations: {},
        sentiment: useSentiment
          ? { score: this.lastFearGreedScore, label: this._sentimentLabel() }
          : undefined,
        mlPrediction: ml,
      };
    }

    // ── Hurst Dead Zone: H ∈ [0.47, 0.53] → skip all entries ─────────────
    if (regime.hurstExponent >= 0.47 && regime.hurstExponent <= 0.53) {
      return {
        signals: [],
        regime,
        allocations: {},
        sentiment: useSentiment
          ? { score: this.lastFearGreedScore, label: this._sentimentLabel() }
          : undefined,
        mlPrediction: ml ?? undefined,
      };
    }

    const allSignals: TradeSignal[] = [];

    // Generate signals from each strategy
    for (const config of strategies) {
      if (!config.isActive) continue;
      const strategy = getStrategyByType(config.type);
      const signals = strategy.generateSignals(data, config);
      allSignals.push(...signals);
    }

    // ── PPO with Real Win Rates (Problem 2 Fix) ───────────────────────────
    const recentPerformance = this.buildRealPerformance(strategies, tradeHistory, data);

    let allocations: Record<string, number> = {};
    if (usePPORL) {
      const action = this.ppoOptimizer.selectAction(regime, strategies, recentPerformance);
      allocations = action.strategyAllocations;
    } else {
      const active = strategies.filter((s) => s.isActive);
      const equalWeight = active.length > 0 ? 1 / active.length : 0;
      for (const s of active) allocations[s.type] = equalWeight;
    }

    // ── Weight signals ────────────────────────────────────────────────────
    const weightedSignals = allSignals.map((signal) => {
      const strategyWeight = allocations[signal.strategy.toLowerCase().replace(/\s+/g, "_")] || 0.2;
      const regimeMatch = this.regimeClassifier
        .selectStrategy(regime)
        .includes(signal.strategy.toLowerCase().replace(/\s+/g, "_"));
      const regimeBoost = regimeMatch ? 0.2 : -0.1;

      // Fear & Greed sentiment boost
      let sentimentBoost = 0;
      if (useSentiment) {
        sentimentBoost = this.fearGreed.toSignalModifier(this.lastFearGreedScore, signal.side);
      }

      // Hurst confidence scaling
      const hurstConfidence = regime.hurstExponent > 0.55 || regime.hurstExponent < 0.45
        ? 1.0
        : 0.75;

      // ── ML Signal Adjustment (Problem 1 Fix, active component) ──────────
      // ML online + agrees with signal → +0.15 boost
      // ML online + disagrees with signal → skip trade
      let mlBoost = 0;
      if (ml?.online && !ml.sitOut) {
        const mlSide = ml.prediction === "UP" ? "buy" : "sell";
        if (mlSide === signal.side) {
          mlBoost = ml.strongSignal ? 0.20 : 0.10;
        } else {
          // ML disagrees — suppress this signal
          return { ...signal, confidence: 0 };
        }
      }

      return {
        ...signal,
        confidence: Math.min(
          0.99,
          Math.max(0.1, signal.confidence * strategyWeight * hurstConfidence + regimeBoost + sentimentBoost + mlBoost)
        ),
      };
    });

    // Filter: must exceed 0.5 confidence gate
    const filteredSignals = weightedSignals.filter((s) => s.confidence > 0.5);
    filteredSignals.sort((a, b) => b.confidence - a.confidence);

    return {
      signals: filteredSignals,
      regime,
      allocations,
      sentiment: useSentiment
        ? { score: this.lastFearGreedScore, label: this._sentimentLabel() }
        : undefined,
      mlPrediction: ml ?? undefined,
    };
  }

  private _sentimentLabel(): string {
    return this.lastFearGreedScore <= 25 ? "Extreme Fear"
      : this.lastFearGreedScore <= 45 ? "Fear"
      : this.lastFearGreedScore <= 55 ? "Neutral"
      : this.lastFearGreedScore <= 75 ? "Greed"
      : "Extreme Greed";
  }
}
