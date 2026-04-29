import type { OHLCV, StrategyConfig, BacktestResult, SimulatedTrade, RiskConfig } from "./types";
import { RiskManager } from "./risk";
import { EnsembleStrategy } from "./ml";

export class BacktestEngine {
  runBacktest(
    data: OHLCV[],
    strategies: StrategyConfig[],
    initialCapital: number,
    riskConfig: RiskConfig,
    useML: boolean = true,
    usePPORL: boolean = true,
    takerFee: number = 0.001,   // 0.1% Binance taker fee (realistic)
    slippage: number = 0.0005   // 0.05% slippage
  ): BacktestResult {
    const ensemble = new EnsembleStrategy();
    const riskManager = new RiskManager({ ...riskConfig, capital: initialCapital });

    let capital = initialCapital;
    const equity: number[] = [capital];
    const trades: SimulatedTrade[] = [];
    let openPositions: Array<{
      entryPrice: number;
      quantity: number;
      side: "buy" | "sell";
      entryAt: number;
      stopLoss?: number;
      takeProfit?: number;
      strategy: string;
      stopLossMoved?: boolean;
      trailingStop?: number;
    }> = [];

    const monthlyReturns: { month: string; return: number }[] = [];
    let monthStart = initialCapital;
    let currentMonth = "";

    // Warm-up period
    const warmup = 50;

    for (let i = warmup; i < data.length; i++) {
      const currentData = data.slice(0, i + 1);
      const currentPrice = data[i].close;
      const currentTime = data[i].timestamp;

      // Check existing positions for exits
      const remainingPositions = [];
      for (const pos of openPositions) {
        const pnlPercent =
          pos.side === "buy"
            ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        let shouldExit = false;
        let exitReason = "";

        // Stop loss
        if (pos.stopLoss) {
          if (pos.side === "buy" && currentPrice <= pos.stopLoss) {
            shouldExit = true;
            exitReason = "Stop Loss";
          } else if (pos.side === "sell" && currentPrice >= pos.stopLoss) {
            shouldExit = true;
            exitReason = "Stop Loss";
          }
        }

        // Take profit
        if (!shouldExit && pos.takeProfit) {
          if (pos.side === "buy" && currentPrice >= pos.takeProfit) {
            shouldExit = true;
            exitReason = "Take Profit";
          } else if (pos.side === "sell" && currentPrice <= pos.takeProfit) {
            shouldExit = true;
            exitReason = "Take Profit";
          }
        }

        // Trailing stop for profits > 5%
        if (!shouldExit && pnlPercent > 5) {
          const trailingStop = pos.side === "buy" ? currentPrice * 0.97 : currentPrice * 1.03;
          if (pos.side === "buy" ? currentPrice < trailingStop : currentPrice > trailingStop) {
            shouldExit = true;
            exitReason = "Trailing Stop";
          }
        }

        // Time-based exit (48 hours simulated as 48 periods for daily data)
        const periods = i - Math.floor((pos.entryAt - data[0].timestamp) / (24 * 60 * 60 * 1000));
        if (!shouldExit && periods > 48 && pnlPercent < -1) {
          shouldExit = true;
          exitReason = "Time Stop";
        }

        if (shouldExit) {
          // Apply slippage on exit
          const exitPrice = pos.side === "buy"
            ? currentPrice * (1 - slippage)  // Sell at slight discount
            : currentPrice * (1 + slippage); // Buy back at slight premium

          const pnl =
            pos.side === "buy"
              ? (exitPrice - pos.entryPrice) * pos.quantity
              : (pos.entryPrice - exitPrice) * pos.quantity;

          // Deduct exit taker fee
          capital += pnl - exitPrice * pos.quantity * takerFee;
          trades.push({
            entryPrice: pos.entryPrice,
            exitPrice: pos.side === "buy"
              ? currentPrice * (1 - slippage)
              : currentPrice * (1 + slippage),
            quantity: pos.quantity,
            side: pos.side,
            pnl: pnl - currentPrice * pos.quantity * takerFee,
            pnlPercent,
            entryAt: pos.entryAt,
            exitAt: currentTime,
            exitReason,
          });

          riskManager.updateState(
            { entryPrice: pos.entryPrice, quantity: pos.quantity, side: pos.side, pnl, pnlPercent, entryAt: pos.entryAt },
            capital
          );
        } else {
          remainingPositions.push(pos);
        }
      }
      openPositions = remainingPositions;

      // Generate signals and enter new positions
      if (!riskManager.getState().circuitBreakerActive) {
        const result = ensemble.generateEnsembleSignals(currentData, strategies, useML, usePPORL);
        const entrySignals = result.signals.filter((s) => s.type === "entry" || s.type === "grid_entry");

        for (const signal of entrySignals.slice(0, 3)) {
          // Max 3 new positions per period
          if (openPositions.length >= riskConfig.maxOpenPositions) break;

          const price = signal.price;
          const positionValue = capital * (riskConfig.riskPerTrade / 100);
          const quantity = positionValue / price;

          const check = riskManager.checkEntry(price, signal.side, quantity, currentData, [], signal.confidence);
          if (check.allowed && check.adjustedSize) {
            const stopLoss =
              check.stopLoss || (signal.side === "buy" ? price * 0.97 : price * 1.03);
            const takeProfit =
              check.takeProfit || (signal.side === "buy" ? price * 1.06 : price * 0.94);

            // Apply slippage on entry
            const entryPrice = signal.side === "buy"
              ? price * (1 + slippage)  // Buy at slight premium
              : price * (1 - slippage); // Short at slight discount

            openPositions.push({
              entryPrice,
              quantity: check.adjustedSize,
              side: signal.side,
              entryAt: currentTime,
              stopLoss,
              takeProfit,
              strategy: signal.strategy,
              stopLossMoved: false,
            });

            // Deduct entry taker fee
            capital -= check.adjustedSize * entryPrice * takerFee;
          }
        }
      }

      // Update equity
      let unrealized = 0;
      for (const pos of openPositions) {
        const pnl =
          pos.side === "buy"
            ? (currentPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - currentPrice) * pos.quantity;
        unrealized += pnl;
      }
      equity.push(capital + unrealized);

      // Monthly returns
      const date = new Date(currentTime);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (currentMonth !== monthKey) {
        if (currentMonth !== "") {
          monthlyReturns.push({
            month: currentMonth,
            return: ((equity[equity.length - 1] - monthStart) / monthStart) * 100,
          });
        }
        monthStart = equity[equity.length - 1];
        currentMonth = monthKey;
      }
    }

    // Close remaining positions at last price
    const lastPrice = data[data.length - 1].close;
    const lastTime = data[data.length - 1].timestamp;
    for (const pos of openPositions) {
      const pnlPercent =
        pos.side === "buy"
          ? ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - lastPrice) / pos.entryPrice) * 100;
      const pnl =
        pos.side === "buy"
          ? (lastPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - lastPrice) * pos.quantity;
      capital += pnl;
      trades.push({
        entryPrice: pos.entryPrice,
        exitPrice: lastPrice,
        quantity: pos.quantity,
        side: pos.side,
        pnl,
        pnlPercent,
        entryAt: pos.entryAt,
        exitAt: lastTime,
        exitReason: "Backtest End",
      });
    }

    // Calculate metrics
    const totalReturn = ((capital - initialCapital) / initialCapital) * 100;
    const returns: number[] = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i] - equity[i - 1]) / equity[i - 1]);
    }

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const stdReturn = Math.sqrt(variance);
    const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    const maxDrawdown = this.calculateMaxDrawdown(equity);
    const profitableTrades = trades.filter((t) => t.pnl > 0);
    const winRate = trades.length > 0 ? (profitableTrades.length / trades.length) * 100 : 0;
    const avgTradeReturn = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length
      : 0;
    const annualVolatility = stdReturn * Math.sqrt(252) * 100;

    return {
      totalReturn,
      sharpeRatio: sharpe,
      maxDrawdown,
      winRate,
      totalTrades: trades.length,
      profitableTrades: profitableTrades.length,
      avgTradeReturn,
      volatility: annualVolatility,
      equityCurve: equity.map((e, i) => ({
        timestamp: data[Math.min(i + warmup, data.length - 1)]?.timestamp || 0,
        equity: e,
      })),
      trades,
      monthlyReturns,
    };
  }

  private calculateMaxDrawdown(equity: number[]): number {
    let peak = equity[0];
    let maxDrawdown = 0;
    for (let i = 1; i < equity.length; i++) {
      if (equity[i] > peak) peak = equity[i];
      const dd = (peak - equity[i]) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    return maxDrawdown;
  }
}
