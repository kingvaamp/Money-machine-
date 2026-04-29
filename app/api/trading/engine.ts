import type { OHLCV, StrategyConfig, RiskConfig, TradeSignal, MarketRegime, Position, BacktestResult } from "./types";
import { generateSyntheticData } from "./types";
import { EnsembleStrategy } from "./ml";
import { RiskManager, CircuitBreaker } from "./risk";
import { BacktestEngine } from "./backtest";
import { liveDataFeed } from "./data-feed";
import { OrderExecutor } from "./executor";
import type { ExecutionMode } from "./executor";

export interface BotState {
  isRunning: boolean;
  mode: ExecutionMode;
  capital: number;
  activeStrategies: number;
  openPositions: number;
  dailyPnl: number;
  totalPnl: number;
  currentDrawdown: number;
  regime: MarketRegime & { hurstExponent?: number };
  lastUpdate: number;
  fearGreedScore?: number;
  fearGreedLabel?: string;
  activeSymbols: string[];
  dataSource: "real" | "synthetic";
}

export class TradingEngine {
  private state: BotState;
  private riskManager: RiskManager;
  private circuitBreaker: CircuitBreaker;
  private ensemble: EnsembleStrategy;
  private backtestEngine: BacktestEngine;
  private strategies: StrategyConfig[] = [];
  private marketData: Map<string, OHLCV[]> = new Map();
  private positions: Position[] = [];
  private signalHistory: TradeSignal[] = [];
  private tradeHistory: Array<{
    entryPrice: number;
    exitPrice?: number;
    quantity: number;
    side: "buy" | "sell";
    pnl: number;
    entryAt: number;
    exitAt?: number;
  }> = [];

  private executor: OrderExecutor;

  constructor(config: RiskConfig) {
    this.state = {
      isRunning: false,
      mode: "simulation",
      capital: config.capital,
      activeStrategies: 0,
      openPositions: 0,
      dailyPnl: 0,
      totalPnl: 0,
      currentDrawdown: 0,
      regime: {
        regime: "ranging",
        confidence: 0.5,
        volatility: 0.02,
        trendStrength: 0,
        volumeProfile: 1,
        hurstExponent: 0.5,
      },
      lastUpdate: Date.now(),
      activeSymbols: [],
      dataSource: "synthetic",
    };
    this.riskManager = new RiskManager(config);
    this.circuitBreaker = new CircuitBreaker();
    this.ensemble = new EnsembleStrategy();
    this.backtestEngine = new BacktestEngine();
    this.executor = new OrderExecutor("simulation");
  }

  /**
   * Load real OHLCV data from Binance via CCXT.
   * Falls back to synthetic data if connection fails.
   */
  async loadRealData(symbol: string, timeframe: string = "1h"): Promise<void> {
    try {
      const data = await liveDataFeed.fetchHistory(symbol, timeframe, 200);
      if (data.length >= 50) {
        this.marketData.set(symbol, data);
        if (!this.state.activeSymbols.includes(symbol)) {
          this.state.activeSymbols.push(symbol);
        }
        this.state.dataSource = "real";
        console.log(`[Engine] Loaded ${data.length} real candles for ${symbol}`);
      } else {
        throw new Error("Insufficient data returned");
      }
    } catch (err) {
      console.warn(`[Engine] Real data fetch failed for ${symbol}, using synthetic fallback:`, err);
      const fallback = generateSyntheticData(symbol, 200);
      this.marketData.set(symbol, fallback);
      this.state.dataSource = "synthetic";
    }
  }

  getState(): BotState {
    return { ...this.state };
  }

  getPositions(): Position[] {
    return [...this.positions];
  }

  getSignals(): TradeSignal[] {
    return [...this.signalHistory].slice(-50);
  }

  getTrades() {
    return [...this.tradeHistory];
  }

  getRiskState() {
    return this.riskManager.getRiskMetrics();
  }

  setStrategies(strategies: StrategyConfig[]) {
    this.strategies = strategies;
    this.state.activeStrategies = strategies.filter((s) => s.isActive).length;
  }

  updateMarketData(symbol: string, data: OHLCV[]) {
    this.marketData.set(symbol, data);
  }

  start(mode: ExecutionMode) {
    this.state.isRunning = true;
    this.state.mode = mode;
    this.executor = new OrderExecutor(mode);
    this.riskManager.resetDaily();
    console.log(`[Engine] Started in ${mode} mode`);
  }

  stop() {
    this.state.isRunning = false;
  }

  async tick(symbol: string): Promise<{
    signals: TradeSignal[];
    regime: MarketRegime & { hurstExponent: number };
    newPositions: Position[];
    closedPositions: Array<{ position: Position; pnl: number; reason: string }>;
    riskEvents: ReturnType<CircuitBreaker["check"]>[number][];
    fearGreed?: { score: number; label: string };
  }> {
    const data = this.marketData.get(symbol);
    if (!data || data.length < 50 || !this.state.isRunning) {
      return { signals: [], regime: this.state.regime as MarketRegime & { hurstExponent: number }, newPositions: [], closedPositions: [], riskEvents: [] };
    }

    // Refresh real sentiment (cached for 1h internally)
    const fearGreed = await this.ensemble.refreshSentiment().catch(() => ({ score: 50, label: "Neutral" }));
    this.state.fearGreedScore = fearGreed.score;
    this.state.fearGreedLabel = fearGreed.label;

    // Update regime + generate signals (with real sentiment)
    const ensembleResult = this.ensemble.generateEnsembleSignals(
      data,
      this.strategies,
      true,  // useML
      true,  // usePPORL
      true   // useSentiment — real Fear & Greed
    );
    this.state.regime = ensembleResult.regime;

    // Check circuit breakers
    const riskState = this.riskManager.getState();
    const cbChecks = this.circuitBreaker.check(riskState);
    const triggered = cbChecks.filter((c) => c.triggered);

    // If critical circuit breaker, halt
    if (triggered.some((t) => t.severity === "critical")) {
      this.state.isRunning = false;
    }

    const signals = ensembleResult.signals;
    this.signalHistory.push(...signals);

    const newPositions: Position[] = [];
    const closedPositions: Array<{ position: Position; pnl: number; reason: string }> = [];

    // Check existing positions for exits
    const remainingPositions: Position[] = [];
    for (const pos of this.positions) {
      const currentPrice = data[data.length - 1].close;
      const exitCheck = this.riskManager.checkExit(pos, currentPrice);

      if (exitCheck.shouldExit) {
        const pnl =
          pos.side === "long"
            ? (currentPrice - pos.avgEntryPrice) * pos.quantity
            : (pos.avgEntryPrice - currentPrice) * pos.quantity;

        closedPositions.push({ position: pos, pnl, reason: exitCheck.reason || "Risk exit" });
        this.state.capital += pnl;
        this.state.dailyPnl += pnl;
        this.tradeHistory.push({
          entryPrice: pos.avgEntryPrice,
          exitPrice: currentPrice,
          quantity: pos.quantity,
          side: pos.side === "long" ? "buy" : "sell",
          pnl,
          entryAt: pos.openedAt.getTime(),
          exitAt: Date.now(),
        });
      } else {
        // Update unrealized PnL
        const unrealized =
          pos.side === "long"
            ? (currentPrice - pos.avgEntryPrice) * pos.quantity
            : (pos.avgEntryPrice - currentPrice) * pos.quantity;
        pos.currentPrice = currentPrice;
        pos.unrealizedPnl = unrealized;
        pos.unrealizedPnlPercent = (unrealized / (pos.avgEntryPrice * pos.quantity)) * 100;
        remainingPositions.push(pos);
      }
    }
    this.positions = remainingPositions;

    // Process entry signals
    for (const signal of signals) {
      if (signal.type !== "entry" && signal.type !== "grid_entry") continue;
      if (this.positions.length >= 10) break;

      const currentPrice = data[data.length - 1].close;
      const check = this.riskManager.checkEntry(
        currentPrice,
        signal.side,
        signal.quantity || 0.1,
        data,
        this.positions,
        signal.confidence
      );

      if (check.allowed && check.adjustedSize) {
        // Execute via OrderExecutor (paper: real Binance testnet, simulation: in-memory)
        const orderResult = await this.executor.placeMarketOrder(
          symbol, signal.side, check.adjustedSize, currentPrice
        ).catch((err) => {
          console.error(`[Engine] Order failed:`, err);
          return null;
        });

        const position: Position = {
          id: orderResult ? parseFloat(orderResult.id) || Date.now() + Math.random() : Date.now() + Math.random(),
          strategyId: 0,
          symbol,
          side: signal.side === "buy" ? "long" : "short",
          quantity: orderResult?.amount ?? check.adjustedSize,
          avgEntryPrice: orderResult?.price ?? currentPrice,
          currentPrice,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          leverage: 1,
          openedAt: new Date(),
          stopLoss: check.stopLoss,
          takeProfit: check.takeProfit,
          stopLossMoved: false,
        };
        this.positions.push(position);
        newPositions.push(position);
      }
    }

    // Update state
    this.state.openPositions = this.positions.length;
    this.state.lastUpdate = Date.now();
    const unrealizedTotal = this.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    this.state.totalPnl = this.state.dailyPnl + unrealizedTotal;

    // Update drawdown
    const riskMetrics = this.riskManager.getRiskMetrics();
    this.state.currentDrawdown = riskMetrics.currentDrawdown;

    return {
      signals,
      regime: this.state.regime as MarketRegime & { hurstExponent: number },
      newPositions,
      closedPositions,
      riskEvents: triggered,
      fearGreed,
    };
  }

  runBacktest(
    symbol: string,
    days: number = 200,
    useML: boolean = true,
    usePPORL: boolean = true,
    realData?: OHLCV[],        // Pass real OHLCV data (fetched from Binance)
    takerFee: number = 0.001, // 0.1% Binance taker fee
    slippage: number = 0.0005 // 0.05% slippage
  ): BacktestResult {
    // Use real data if provided, otherwise generate synthetic fallback
    const data = realData && realData.length >= 50
      ? realData
      : generateSyntheticData(symbol, days);

    const riskConfig: RiskConfig = {
      maxDailyLoss: 7,
      maxPositionSize: 2,
      maxOpenPositions: 10,
      defaultStopLoss: 3,
      defaultTakeProfit: 6,
      riskPerTrade: 2,
      capital: 100000,
    };
    return this.backtestEngine.runBacktest(
      data, this.strategies, 100000, riskConfig, useML, usePPORL, takerFee, slippage
    );
  }

  /**
   * Append a synthetic candle for simulation mode (when no live feed is active).
   * Used by the manual "Tick" button in the Terminal.
   */
  generateLiveData(symbol: string) {
    const existing = this.marketData.get(symbol);
    if (!existing || existing.length === 0) {
      const data = generateSyntheticData(symbol, 200);
      this.marketData.set(symbol, data);
      return data;
    }

    const last = existing[existing.length - 1];
    const volatility = 0.015;
    const change = (Math.random() - 0.5) * volatility;
    const newPrice = last.close * (1 + change);

    const newCandle: OHLCV = {
      timestamp: Date.now(),
      open: last.close,
      high: Math.max(last.close, newPrice) * (1 + Math.random() * volatility * 0.3),
      low: Math.min(last.close, newPrice) * (1 - Math.random() * volatility * 0.3),
      close: newPrice,
      volume: 1000 + Math.random() * 5000,
    };

    const updated = [...existing.slice(-499), newCandle];
    this.marketData.set(symbol, updated);
    return updated;
  }
}
