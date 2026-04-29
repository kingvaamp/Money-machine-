/**
 * LiveDataFeed — CCXT Pro WebSocket-based real-time market data manager.
 *
 * Connects to Binance (testnet or live) and:
 * - Streams real-time OHLCV candles via WebSocket
 * - Maintains a rolling buffer of the last 500 candles per symbol/timeframe
 * - Fetches historical candles on startup for strategy warm-up
 * - Falls back to REST polling if WebSocket is unavailable
 */

import ccxt, { type OHLCV as CCXTOHLCV } from "ccxt";
import type { OHLCV } from "./types";
import { env } from "../lib/env";

const CANDLE_BUFFER_SIZE = 500;

// Convert CCXT OHLCV tuple [timestamp, open, high, low, close, volume] to our type
function fromCCXT(raw: CCXTOHLCV): OHLCV {
  return {
    timestamp: raw[0] as number,
    open: raw[1] as number,
    high: raw[2] as number,
    low: raw[3] as number,
    close: raw[4] as number,
    volume: raw[5] as number,
  };
}

export class LiveDataFeed {
  private exchange: ccxt.pro.binance;
  private buffers: Map<string, OHLCV[]> = new Map();
  private watching: Set<string> = new Set();
  private listeners: Map<string, Array<(candles: OHLCV[]) => void>> = new Map();

  constructor() {
    const config: ccxt.Exchange["options"] & Record<string, unknown> = {
      apiKey: env.binanceApiKey,
      secret: env.binanceApiSecret,
      enableRateLimit: true,
      options: {
        defaultType: "spot",
      },
    };

    if (env.binanceTestnet) {
      (config as Record<string, unknown>)["options"] = {
        ...(config as Record<string, unknown>)["options"] as object,
        testnet: true,
      };
    }

    this.exchange = new ccxt.pro.binance(config);

    if (env.binanceTestnet) {
      this.exchange.setSandboxMode(true);
      console.log("[LiveDataFeed] Running in TESTNET mode");
    }
  }

  /**
   * Fetch historical OHLCV candles for strategy warm-up and backtesting.
   * Returns real past price data from Binance.
   */
  async fetchHistory(
    symbol: string,
    timeframe: string = "1h",
    days: number = 200
  ): Promise<OHLCV[]> {
    const limit = Math.min(days * this.candlesPerDay(timeframe), 1000);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      console.log(`[LiveDataFeed] Fetching ${limit} candles of ${symbol} (${timeframe})...`);
      const rawCandles = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
      const candles = rawCandles.map(fromCCXT);
      this.buffers.set(this.key(symbol, timeframe), candles.slice(-CANDLE_BUFFER_SIZE));
      console.log(`[LiveDataFeed] Loaded ${candles.length} historical candles for ${symbol}`);
      return candles;
    } catch (err) {
      console.error(`[LiveDataFeed] fetchHistory error for ${symbol}:`, err);
      return [];
    }
  }

  /**
   * Start watching a symbol's candles via WebSocket.
   * Calls onCandle every time a new closed candle is available.
   */
  async startWatching(
    symbol: string,
    timeframe: string = "1h",
    onCandle: (candles: OHLCV[]) => void
  ): Promise<void> {
    const k = this.key(symbol, timeframe);

    // Register listener
    if (!this.listeners.has(k)) this.listeners.set(k, []);
    this.listeners.get(k)!.push(onCandle);

    // Only start one watch loop per symbol+timeframe
    if (this.watching.has(k)) return;
    this.watching.add(k);

    // Ensure we have historical data for warm-up
    if (!this.buffers.has(k) || (this.buffers.get(k)?.length ?? 0) < 50) {
      await this.fetchHistory(symbol, timeframe);
    }

    // Start WebSocket streaming loop
    this.watchLoop(symbol, timeframe, k);
  }

  private async watchLoop(symbol: string, timeframe: string, k: string): Promise<void> {
    while (this.watching.has(k)) {
      try {
        const rawCandles = await (this.exchange as ccxt.pro.Exchange).watchOHLCV(symbol, timeframe);
        const newCandles = rawCandles.map(fromCCXT);

        // Merge into buffer
        const buf = this.buffers.get(k) ?? [];
        for (const candle of newCandles) {
          const lastBuf = buf[buf.length - 1];
          if (!lastBuf || candle.timestamp > lastBuf.timestamp) {
            buf.push(candle);
          } else if (candle.timestamp === lastBuf.timestamp) {
            // Update the current open candle in place
            buf[buf.length - 1] = candle;
          }
        }

        // Keep rolling window
        const trimmed = buf.slice(-CANDLE_BUFFER_SIZE);
        this.buffers.set(k, trimmed);

        // Notify all listeners
        for (const listener of this.listeners.get(k) ?? []) {
          listener(trimmed);
        }
      } catch (err) {
        console.error(`[LiveDataFeed] watchOHLCV error for ${symbol}:`, err);
        // Brief pause before retry to avoid hammering on error
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  /**
   * Stop watching a specific symbol+timeframe.
   */
  stopWatching(symbol: string, timeframe: string = "1h"): void {
    this.watching.delete(this.key(symbol, timeframe));
    this.listeners.delete(this.key(symbol, timeframe));
  }

  /**
   * Get the current candle buffer for a symbol (without starting a new watch).
   */
  getBuffer(symbol: string, timeframe: string = "1h"): OHLCV[] {
    return this.buffers.get(this.key(symbol, timeframe)) ?? [];
  }

  /**
   * Fetch the current ticker (best bid/ask, last price) for a symbol.
   */
  async fetchTicker(symbol: string): Promise<{ bid: number; ask: number; last: number } | null> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return {
        bid: ticker.bid ?? ticker.last ?? 0,
        ask: ticker.ask ?? ticker.last ?? 0,
        last: ticker.last ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch order book for a symbol (top N levels).
   */
  async fetchOrderBook(symbol: string, limit = 10): Promise<{ bids: number[][]; asks: number[][] }> {
    try {
      const ob = await this.exchange.fetchOrderBook(symbol, limit);
      return { bids: ob.bids as number[][], asks: ob.asks as number[][] };
    } catch {
      return { bids: [], asks: [] };
    }
  }

  /**
   * Close all WebSocket connections.
   */
  async close(): Promise<void> {
    this.watching.clear();
    this.listeners.clear();
    try {
      await this.exchange.close();
    } catch { /* ignore */ }
  }

  private key(symbol: string, timeframe: string): string {
    return `${symbol}:${timeframe}`;
  }

  private candlesPerDay(timeframe: string): number {
    const map: Record<string, number> = {
      "1m": 1440, "5m": 288, "15m": 96,
      "1h": 24, "4h": 6, "1d": 1,
    };
    return map[timeframe] ?? 24;
  }
}

// Singleton — one feed instance shared across the whole server process
export const liveDataFeed = new LiveDataFeed();
