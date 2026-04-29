import type { Position, RiskConfig, OHLCV, SimulatedTrade } from "./types";
import { calculateATR } from "./types";

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  adjustedSize?: number;
  stopLoss?: number;
  takeProfit?: number;
  stopPhase?: "initial" | "breakeven" | "trailing";
}

export interface RiskState {
  dailyPnl: number;
  dailyReturn: number;
  weeklyPnl: number;
  weeklyReturn: number;
  currentDrawdown: number;
  maxDrawdown: number;
  peakEquity: number;
  openPositions: number;
  totalExposure: number;
  availableCapital: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  lastTradeResult: "win" | "loss" | null;
  circuitBreakerActive: boolean;
  circuitBreakerReason?: string;
  pauseUntil?: number;
}

export type SignalConfidence = "low" | "medium" | "high";

export class RiskManager {
  private config: RiskConfig;
  private state: RiskState;
  private dailyStartCapital: number;
  private weeklyStartCapital: number;
  private trades: SimulatedTrade[] = [];

  constructor(config: RiskConfig) {
    this.config = config;
    this.dailyStartCapital = config.capital;
    this.weeklyStartCapital = config.capital;
    this.state = {
      dailyPnl: 0,
      dailyReturn: 0,
      weeklyPnl: 0,
      weeklyReturn: 0,
      currentDrawdown: 0,
      maxDrawdown: 0,
      peakEquity: config.capital,
      openPositions: 0,
      totalExposure: 0,
      availableCapital: config.capital,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      lastTradeResult: null,
      circuitBreakerActive: false,
    };
  }

  getState(): RiskState {
    return { ...this.state };
  }

  resetDaily() {
    this.dailyStartCapital = this.config.capital + this.state.dailyPnl;
    this.state.dailyPnl = 0;
    this.state.dailyReturn = 0;
    this.state.circuitBreakerActive = false;
    this.state.circuitBreakerReason = undefined;
  }

  resetWeekly() {
    this.weeklyStartCapital = this.config.capital + this.state.weeklyPnl;
    this.state.weeklyPnl = 0;
    this.state.weeklyReturn = 0;
  }

  isPaused(): boolean {
    if (this.state.pauseUntil && Date.now() < this.state.pauseUntil) {
      return true;
    }
    this.state.pauseUntil = undefined;
    return false;
  }

  getSignalConfidence(confidence: number): SignalConfidence {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.6) return "medium";
    return "low";
  }

  getRiskPerTrade(confidence: number): number {
    const level = this.getSignalConfidence(confidence);
    switch (level) {
      case "high": return 2;
      case "medium": return 1;
      case "low": return 0.5;
    }
  }

  // Kelly Criterion position sizing
  calculateKellyPosition(winRate: number, avgWin: number, avgLoss: number): number {
    if (avgLoss === 0) return this.config.maxPositionSize / 100;
    const q = 1 - winRate;
    const kelly = winRate - q / (avgWin / avgLoss);
    // Half Kelly for safety
    const halfKelly = kelly / 2;
    return Math.max(0, Math.min(halfKelly, this.config.maxPositionSize / 100));
  }

  // Volatility-adjusted position sizing using ATR
  calculateATRPositionSize(
    price: number,
    capital: number,
    atr: number,
    riskPerTrade: number = this.config.riskPerTrade
  ): number {
    const riskAmount = capital * (riskPerTrade / 100);
    const stopDistance = atr * 2; // 2 ATR stop
    const positionValue = riskAmount / (stopDistance / price);
    const positionSize = positionValue / price;
    const maxPositionValue = capital * (this.config.maxPositionSize / 100);
    const maxSize = maxPositionValue / price;

    return Math.min(positionSize, maxSize);
  }

  checkEntry(
    price: number,
    side: "buy" | "sell",
    proposedSize: number,
    data: OHLCV[],
    existingPositions: Position[],
    signalConfidence: number = 0.6
  ): RiskCheck {
    // Pause check (after consecutive losses)
    if (this.isPaused()) {
      return { allowed: false, reason: `Trading paused due to consecutive losses. Resumes at ${new Date(this.state.pauseUntil).toLocaleTimeString()}` };
    }

    // Circuit breaker check
    if (this.state.circuitBreakerActive) {
      return { allowed: false, reason: `Circuit breaker: ${this.state.circuitBreakerReason}` };
    }

    // Daily loss limit check
    const dailyLossPercent = (this.state.dailyPnl / this.dailyStartCapital) * 100;
    if (dailyLossPercent <= -this.config.maxDailyLoss) {
      this.state.circuitBreakerActive = true;
      this.state.circuitBreakerReason = `Daily loss limit reached: ${dailyLossPercent.toFixed(2)}%`;
      return { allowed: false, reason: this.state.circuitBreakerReason };
    }

    // Weekly loss limit check (new)
    const weeklyLossPercent = (this.state.weeklyPnl / this.weeklyStartCapital) * 100;
    if (weeklyLossPercent <= -10) {
      this.state.circuitBreakerActive = true;
      this.state.circuitBreakerReason = `Weekly loss limit reached: ${weeklyLossPercent.toFixed(2)}%`;
      return { allowed: false, reason: this.state.circuitBreakerReason };
    }

    // Max open positions check
    if (existingPositions.length >= this.config.maxOpenPositions) {
      return { allowed: false, reason: `Max open positions reached: ${this.config.maxOpenPositions}` };
    }

    // Confidence-based position sizing (new)
    const riskPerTrade = this.getRiskPerTrade(signalConfidence);
    const atr = calculateATR(data, 14);
    const currentATR = atr[atr.length - 1] || price * 0.02;
    const stopDistancePercent = (currentATR * 2) / price;
    
    // If stop distance > 4%, reduce position further
    const maxStopDistance = 0.04;
    const adjustedRiskPerTrade = stopDistancePercent > maxStopDistance 
      ? riskPerTrade * (maxStopDistance / stopDistancePercent)
      : riskPerTrade;

    const riskAmount = this.config.capital * (adjustedRiskPerTrade / 100);
    const positionValue = riskAmount / stopDistancePercent;
    let positionSize = positionValue / price;

    // Enforce max position size
    const maxSize = this.config.capital * (this.config.maxPositionSize / 100) / price;
    if (positionSize > maxSize) {
      positionSize = maxSize;
    }

    // ATR-based stop loss and take profit
    const stopLoss = side === "buy" ? price - currentATR * 2 : price + currentATR * 2;
    const takeProfit = side === "buy" ? price + currentATR * 3 : price - currentATR * 3;

    // Total exposure check
    const newPositionValue = positionSize * price;
    const currentExposure = existingPositions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    if (currentExposure + newPositionValue > this.config.capital * 0.8) {
      return { allowed: false, reason: "Total exposure would exceed 80% of capital" };
    }

    return {
      allowed: true,
      adjustedSize: positionSize,
      stopLoss,
      takeProfit,
      stopPhase: "initial",
    };
  }

  checkExit(position: Position, currentPrice: number): { shouldExit: boolean; reason?: string; stopPhase?: "initial" | "breakeven" | "trailing" } {
    const unrealizedPnlPercent =
      position.side === "long"
        ? ((currentPrice - position.avgEntryPrice) / position.avgEntryPrice) * 100
        : ((position.avgEntryPrice - currentPrice) / position.avgEntryPrice) * 100;

    const entryPrice = position.avgEntryPrice;
    const riskAmount = Math.abs(currentPrice - entryPrice) * position.quantity;
    const initialRisk = Math.abs((position.stopLoss || entryPrice) - entryPrice) * position.quantity;
    const rMultiple = initialRisk > 0 ? (unrealizedPnlPercent * position.quantity) / (initialRisk / position.quantity) : 0;

    // Stop loss hit
    if (position.stopLoss && !position.stopLossMoved) {
      const stopHit =
        position.side === "long"
          ? currentPrice <= position.stopLoss
          : currentPrice >= position.stopLoss;
      if (stopHit) {
        return { shouldExit: true, reason: "Stop loss triggered", stopPhase: "initial" };
      }
    }

    // Breakeven move: when profit reaches 1R, move stop to entry
    if (rMultiple >= 1 && !position.stopLossMoved) {
      position.stopLoss = entryPrice;
      position.stopLossMoved = true;
      return { shouldExit: false, reason: "Moved to breakeven", stopPhase: "breakeven" };
    }

    // Check breakeven stop
    if (position.stopLossMoved && position.stopLoss === entryPrice) {
      const breakevenHit =
        position.side === "long"
          ? currentPrice <= entryPrice * 0.99
          : currentPrice >= entryPrice * 1.01;
      if (breakevenHit) {
        return { shouldExit: true, reason: "Breakeven stop triggered", stopPhase: "breakeven" };
      }
    }

    // Trailing stop: when profit reaches 2R, trail with ATR
    if (rMultiple >= 2) {
      const atrMultiplier = position.side === "long" ? 1.5 : 1.5;
      const newTrailingStop = position.side === "long"
        ? currentPrice - (currentPrice * 0.02)
        : currentPrice + (currentPrice * 0.02);
      
      const currentTrailingStop = position.trailingStop || (position.side === "long" ? entryPrice : entryPrice);
      const updatedTrailingStop = position.side === "long"
        ? Math.max(currentTrailingStop, newTrailingStop)
        : Math.min(currentTrailingStop, newTrailingStop);
      
      position.trailingStop = updatedTrailingStop;

      const trailingHit =
        position.side === "long"
          ? currentPrice <= updatedTrailingStop
          : currentPrice >= updatedTrailingStop;
      
      if (trailingHit) {
        return { shouldExit: true, reason: "Trailing stop triggered", stopPhase: "trailing" };
      }
    }

    // Take profit hit
    if (position.takeProfit) {
      const tpHit =
        position.side === "long"
          ? currentPrice >= position.takeProfit
          : currentPrice <= position.takeProfit;
      if (tpHit) {
        return { shouldExit: true, reason: "Take profit triggered", stopPhase: "trailing" };
      }
    }

    // Time-based exit (hold too long without profit)
    const holdTime = Date.now() - position.openedAt.getTime();
    const hours = holdTime / (1000 * 60 * 60);
    if (hours > 48 && unrealizedPnlPercent < -1) {
      return { shouldExit: true, reason: "Time stop: held too long at loss", stopPhase: "initial" };
    }

    return { shouldExit: false, stopPhase: rMultiple >= 2 ? "trailing" : rMultiple >= 1 ? "breakeven" : "initial" };
  }

  updateState(trade: SimulatedTrade, currentEquity: number) {
    this.trades.push(trade);
    this.state.dailyPnl += trade.pnl;
    this.state.weeklyPnl += trade.pnl;
    this.state.dailyReturn = (this.state.dailyPnl / this.dailyStartCapital) * 100;
    this.state.weeklyReturn = (this.state.weeklyPnl / this.weeklyStartCapital) * 100;

    // Track peak equity for drawdown calculation
    if (currentEquity > this.state.peakEquity) {
      this.state.peakEquity = currentEquity;
    }

    // Update drawdown based on peak equity
    const drawdown = Math.max(0, (this.state.peakEquity - currentEquity) / this.state.peakEquity);
    this.state.currentDrawdown = drawdown;
    if (drawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = drawdown;
    }

    // Track consecutive wins/losses
    if (trade.pnl > 0) {
      if (this.state.lastTradeResult === "win") {
        this.state.consecutiveWins++;
      }
      this.state.consecutiveWins = 1;
      this.state.consecutiveLosses = 0;
      this.state.lastTradeResult = "win";
    } else {
      if (this.state.lastTradeResult === "loss") {
        this.state.consecutiveLosses++;
      }
      this.state.consecutiveLosses = 1;
      this.state.consecutiveWins = 0;
      this.state.lastTradeResult = "loss";
    }

    // Pause after 5 consecutive losses
    if (this.state.consecutiveLosses >= 5) {
      this.state.pauseUntil = Date.now() + 60 * 60 * 1000; // Pause for 1 hour
      console.warn(`[RiskManager] Pausing trading after ${this.state.consecutiveLosses} consecutive losses`);
    }

    // Check circuit breakers after trade
    if (this.state.dailyReturn <= -this.config.maxDailyLoss) {
      this.state.circuitBreakerActive = true;
      this.state.circuitBreakerReason = `Daily loss limit: ${this.state.dailyReturn.toFixed(2)}%`;
    }

    // Weekly loss limit
    if (this.state.weeklyReturn <= -10) {
      this.state.circuitBreakerActive = true;
      this.state.circuitBreakerReason = `Weekly loss limit: ${this.state.weeklyReturn.toFixed(2)}%`;
    }

    if (this.state.currentDrawdown >= 0.15) {
      this.state.circuitBreakerActive = true;
      this.state.circuitBreakerReason = `Max drawdown limit: ${(this.state.currentDrawdown * 100).toFixed(2)}%`;
    }

    // Drawdown warning at 10%
    if (this.state.currentDrawdown >= 0.10 && this.state.currentDrawdown < 0.15) {
      console.warn(`[RiskManager] Drawdown warning: ${(this.state.currentDrawdown * 100).toFixed(2)}%`);
    }
  }

  // Calculate required recovery after drawdown
  static calculateRecoveryRequirement(drawdownPercent: number): number {
    const dd = drawdownPercent / 100;
    return dd >= 1 ? Infinity : (dd / (1 - dd)) * 100;
  }

  getRiskMetrics() {
    const profitable = this.trades.filter((t) => t.pnl > 0);
    const losing = this.trades.filter((t) => t.pnl <= 0);
    const avgWin = profitable.length > 0 ? profitable.reduce((s, t) => s + t.pnlPercent, 0) / profitable.length : 0;
    const avgLoss = losing.length > 0 ? Math.abs(losing.reduce((s, t) => s + t.pnlPercent, 0)) / losing.length : 1;
    const winRate = this.trades.length > 0 ? profitable.length / this.trades.length : 0;

    return {
      ...this.state,
      totalTrades: this.trades.length,
      profitableTrades: profitable.length,
      losingTrades: losing.length,
      winRate,
      avgWin,
      avgLoss,
      profitFactor: avgLoss > 0 ? avgWin / avgLoss : 0,
      kellyFraction: this.calculateKellyPosition(winRate, avgWin, avgLoss),
      recoveryRequired: RiskManager.calculateRecoveryRequirement(this.state.currentDrawdown * 100),
    };
  }
}

export class CircuitBreaker {
  private triggers: Array<{
    condition: (state: RiskState) => boolean;
    name: string;
    severity: "info" | "warning" | "critical";
    cooldownMs: number;
    lastTriggered: number;
  }> = [];

  constructor() {
    // Daily loss warning (5%)
    this.triggers.push({
      condition: (s) => s.dailyReturn <= -5,
      name: "Daily Loss 5%",
      severity: "warning",
      cooldownMs: 24 * 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Daily loss critical (7%)
    this.triggers.push({
      condition: (s) => s.dailyReturn <= -7,
      name: "Daily Loss 7%",
      severity: "critical",
      cooldownMs: 24 * 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Weekly loss warning (7%)
    this.triggers.push({
      condition: (s) => s.weeklyReturn <= -7,
      name: "Weekly Loss 7%",
      severity: "warning",
      cooldownMs: 24 * 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Weekly loss critical (10%)
    this.triggers.push({
      condition: (s) => s.weeklyReturn <= -10,
      name: "Weekly Loss 10%",
      severity: "critical",
      cooldownMs: 24 * 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Drawdown warning (10%)
    this.triggers.push({
      condition: (s) => s.currentDrawdown >= 0.1,
      name: "Drawdown 10%",
      severity: "warning",
      cooldownMs: 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Drawdown critical (15%)
    this.triggers.push({
      condition: (s) => s.currentDrawdown >= 0.15,
      name: "Drawdown 15%",
      severity: "critical",
      cooldownMs: 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Consecutive losses warning (5)
    this.triggers.push({
      condition: (s) => s.consecutiveLosses >= 5,
      name: "Consecutive Losses 5",
      severity: "warning",
      cooldownMs: 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Consecutive losses critical (10)
    this.triggers.push({
      condition: (s) => s.consecutiveLosses >= 10,
      name: "Consecutive Losses 10",
      severity: "critical",
      cooldownMs: 24 * 60 * 60 * 1000,
      lastTriggered: 0,
    });

    // Too many open positions
    this.triggers.push({
      condition: (s) => s.openPositions >= 15,
      name: "Too Many Positions",
      severity: "warning",
      cooldownMs: 5 * 60 * 1000,
      lastTriggered: 0,
    });
  }

  check(state: RiskState): Array<{ triggered: boolean; name: string; severity: string; message: string }> {
    const now = Date.now();
    return this.triggers.map((trigger) => {
      if (now - trigger.lastTriggered < trigger.cooldownMs) {
        return { triggered: false, name: trigger.name, severity: trigger.severity, message: "" };
      }

      const triggered = trigger.condition(state);
      if (triggered) {
        trigger.lastTriggered = now;
      }

      return {
        triggered,
        name: trigger.name,
        severity: trigger.severity,
        message: triggered ? `${trigger.name} threshold breached` : "",
      };
    });
  }
}
