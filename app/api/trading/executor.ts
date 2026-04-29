/**
 * OrderExecutor — routes trade orders to either:
 *   - Binance Testnet (paper mode): real matching engine, no real money
 *   - Internal simulation (simulation mode): updates in-memory state only
 *
 * This is the execution layer between the TradingEngine signals and the exchange.
 */

import ccxt from "ccxt";
import { env } from "../lib/env";

export type ExecutionMode = "simulation" | "paper" | "live";

export interface OrderResult {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  status: "open" | "closed" | "canceled";
  fee?: number;
  timestamp: number;
}

export interface Balance {
  USDT: number;
  BTC: number;
  ETH: number;
  SOL: number;
  BNB: number;
  XRP: number;
  ADA: number;
  AVAX: number;
  DOGE: number;
  DOT: number;
  LINK: number;
  MATIC: number;
  UNI: number;
  [key: string]: number;
}

export class OrderExecutor {
  private exchange: ccxt.binance | null = null;
  private mode: ExecutionMode;

  constructor(mode: ExecutionMode = "simulation") {
    this.mode = mode;

    if (mode !== "simulation") {
      const config: ConstructorParameters<typeof ccxt.binance>[0] = {
        apiKey: env.binanceApiKey,
        secret: env.binanceApiSecret,
        enableRateLimit: true,
        options: { defaultType: "spot" },
      };
      this.exchange = new ccxt.binance(config);

      if (env.binanceTestnet) {
        this.exchange.setSandboxMode(true);
        console.log("[OrderExecutor] Using Binance Testnet (paper mode)");
      }
    }
  }

  /**
   * Place a market order. In simulation mode, returns a fake filled order.
   */
  async placeMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    currentPrice: number
  ): Promise<OrderResult> {
    if (this.mode === "simulation" || !this.exchange) {
      // Simulation: return a synthetic filled order
      return {
        id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        symbol,
        side,
        amount,
        price: currentPrice * (side === "buy" ? 1.0005 : 0.9995), // 0.05% simulated slippage
        status: "closed",
        fee: currentPrice * amount * 0.001, // 0.1% simulated fee
        timestamp: Date.now(),
      };
    }

    try {
      const order = await this.exchange.createMarketOrder(symbol, side, amount);
      return {
        id: String(order.id),
        symbol,
        side,
        amount: order.filled ?? amount,
        price: order.average ?? order.price ?? currentPrice,
        status: (order.status as OrderResult["status"]) ?? "closed",
        fee: order.fee?.cost ?? 0,
        timestamp: order.timestamp ?? Date.now(),
      };
    } catch (err) {
      console.error(`[OrderExecutor] placeMarketOrder failed for ${symbol}:`, err);
      throw err;
    }
  }

  /**
   * Fetch current balances from the exchange (or return simulation defaults).
   */
  async getBalance(): Promise<Balance> {
    if (this.mode === "simulation" || !this.exchange) {
      return {
        USDT: 10000, BTC: 0, ETH: 0, SOL: 0, BNB: 0,
        XRP: 0, ADA: 0, AVAX: 0, DOGE: 0, DOT: 0,
        LINK: 0, MATIC: 0, UNI: 0,
      };
    }

    try {
      const bal = await this.exchange.fetchBalance();
      const result: Balance = {
        USDT: 0, BTC: 0, ETH: 0, SOL: 0, BNB: 0,
        XRP: 0, ADA: 0, AVAX: 0, DOGE: 0, DOT: 0,
        LINK: 0, MATIC: 0, UNI: 0,
      };
      for (const [asset, info] of Object.entries(bal.total ?? {})) {
        if (typeof info === "number") result[asset] = info;
      }
      return result;
    } catch (err) {
      console.error("[OrderExecutor] getBalance failed:", err);
      return {
        USDT: 0, BTC: 0, ETH: 0, SOL: 0, BNB: 0,
        XRP: 0, ADA: 0, AVAX: 0, DOGE: 0, DOT: 0,
        LINK: 0, MATIC: 0, UNI: 0,
      };
    }
  }

  /**
   * Fetch open orders for a symbol.
   */
  async getOpenOrders(symbol: string): Promise<OrderResult[]> {
    if (this.mode === "simulation" || !this.exchange) return [];
    try {
      const orders = await this.exchange.fetchOpenOrders(symbol);
      return orders.map((o) => ({
        id: String(o.id),
        symbol: o.symbol,
        side: o.side as "buy" | "sell",
        amount: o.amount,
        price: o.price ?? 0,
        status: (o.status as OrderResult["status"]) ?? "open",
        fee: o.fee?.cost ?? 0,
        timestamp: o.timestamp ?? Date.now(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Cancel an open order.
   */
  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    if (this.mode === "simulation" || !this.exchange) return;
    try {
      await this.exchange.cancelOrder(orderId, symbol);
    } catch (err) {
      console.error(`[OrderExecutor] cancelOrder failed for ${orderId}:`, err);
    }
  }

  getMode(): ExecutionMode { return this.mode; }
}
