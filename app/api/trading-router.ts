import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { TradingEngine } from "./trading/engine";
import type { RiskConfig, StrategyConfig } from "./trading/types";
import { SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "./trading/symbols";
import { liveDataFeed } from "./trading/data-feed";

// Store engines by user for demo
const engines = new Map<number, TradingEngine>();

function getOrCreateEngine(userId: number, config?: RiskConfig): TradingEngine {
  if (!engines.has(userId)) {
    engines.set(
      userId,
      new TradingEngine(
        config || {
          maxDailyLoss: 7,
          maxPositionSize: 2,
          maxOpenPositions: 10,
          defaultStopLoss: 3,
          defaultTakeProfit: 6,
          riskPerTrade: 2,
          capital: 100000,
        }
      )
    );
  }
  return engines.get(userId)!;
}

export const tradingRouter = createRouter({
  startBot: publicQuery
    .input(
      z.object({
        mode: z.enum(["simulation", "paper", "live"]).default("paper"),
        symbol: z.string().default("BTC/USDT"),
        capital: z.number().default(100000),
        maxDailyLoss: z.number().default(7),
        maxPositionSize: z.number().default(2),
        maxOpenPositions: z.number().default(10),
        riskPerTrade: z.number().default(2),
        timeframe: z.string().default("1h"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id || 1;
      const riskConfig: RiskConfig = {
        capital: input.capital,
        maxDailyLoss: input.maxDailyLoss,
        maxPositionSize: input.maxPositionSize,
        maxOpenPositions: input.maxOpenPositions,
        defaultStopLoss: 3,
        defaultTakeProfit: 6,
        riskPerTrade: input.riskPerTrade,
      };
      const engine = getOrCreateEngine(userId, riskConfig);
      engine.start(input.mode as "paper" | "live");

      // Load real historical data from Binance (or synthetic fallback)
      await engine.loadRealData(input.symbol, input.timeframe);

      // Start live streaming if not in simulation
      if (input.mode !== "simulation") {
        liveDataFeed.startWatching(input.symbol, input.timeframe, (candles) => {
          engine.updateMarketData(input.symbol, candles);
        });
      }

      return { success: true, state: engine.getState() };
    }),

  stopBot: publicQuery.mutation(({ ctx }) => {
    const userId = ctx.user?.id || 1;
    const engine = engines.get(userId);
    if (engine) {
      engine.stop();
      return { success: true, state: engine.getState() };
    }
    return { success: false, error: "No active engine" };
  }),

  getState: publicQuery.query(({ ctx }) => {
    const userId = ctx.user?.id || 1;
    const engine = engines.get(userId);
    if (!engine) return {
      isRunning: false,
      mode: "paper" as const,
      capital: 100000,
      activeStrategies: 0,
      openPositions: 0,
      dailyPnl: 0,
      totalPnl: 0,
      currentDrawdown: 0,
      regime: {
        regime: "ranging" as const,
        confidence: 0.5,
        volatility: 0.02,
        trendStrength: 0,
        volumeProfile: 1,
        hurstExponent: 0.5,
      },
      lastUpdate: Date.now(),
      fearGreedScore: 50,
      fearGreedLabel: "Neutral",
      activeSymbols: [] as string[],
      dataSource: "synthetic" as const,
    };
    return engine.getState();
  }),

  tick: publicQuery
    .input(z.object({ symbol: z.string().default("BTC/USDT") }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id || 1;
      const engine = engines.get(userId);
      if (!engine) return { error: "No active engine" };
      const result = await engine.tick(input.symbol);
      return {
        ...result,
        state: engine.getState(),
      };
    }),

  getPositions: publicQuery.query(({ ctx }) => {
    const userId = ctx.user?.id || 1;
    const engine = engines.get(userId);
    if (!engine) return [];
    return engine.getPositions();
  }),

  getSignals: publicQuery.query(({ ctx }) => {
    const userId = ctx.user?.id || 1;
    const engine = engines.get(userId);
    if (!engine) return [];
    return engine.getSignals();
  }),

  getTrades: publicQuery.query(({ ctx }) => {
    const userId = ctx.user?.id || 1;
    const engine = engines.get(userId);
    if (!engine) return [];
    return engine.getTrades();
  }),

  getRiskMetrics: publicQuery.query(({ ctx }) => {
    const userId = ctx.user?.id || 1;
    const engine = engines.get(userId);
    if (!engine) return null;
    return engine.getRiskState();
  }),

  setStrategies: publicQuery
    .input(
      z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          type: z.string(),
          symbol: z.string(),
          timeframe: z.string(),
          parameters: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
          weight: z.number(),
          isActive: z.boolean(),
        })
      )
    )
    .mutation(({ input, ctx }) => {
      const userId = ctx.user?.id || 1;
      const engine = getOrCreateEngine(userId);
      engine.setStrategies(input as StrategyConfig[]);
      return { success: true, count: input.length };
    }),

  getMarketData: publicQuery
    .input(z.object({
      symbol: z.string().default("BTC/USDT"),
      timeframe: z.string().default("1h"),
    }))
    .query(async ({ input }) => {
      // First try to get buffered live data
      const buffered = liveDataFeed.getBuffer(input.symbol, input.timeframe);
      if (buffered.length >= 50) {
        return buffered.slice(-100);
      }
      // Otherwise fetch from exchange
      const fresh = await liveDataFeed.fetchHistory(input.symbol, input.timeframe, 5);
      return fresh.slice(-100);
    }),

  // New: get real-time ticker (best bid/ask + last price)
  getTicker: publicQuery
    .input(z.object({ symbol: z.string().default("BTC/USDT") }))
    .query(async ({ input }) => {
      return await liveDataFeed.fetchTicker(input.symbol);
    }),

  // New: get real order book
  getOrderBook: publicQuery
    .input(z.object({ symbol: z.string().default("BTC/USDT"), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      return await liveDataFeed.fetchOrderBook(input.symbol, input.limit);
    }),

  // New: get supported symbols list
  getSupportedSymbols: publicQuery.query(() => {
    return SUPPORTED_SYMBOLS;
  }),

  // New: get supported timeframes
  getSupportedTimeframes: publicQuery.query(() => {
    return SUPPORTED_TIMEFRAMES;
  }),

  // New: fetch historical data for a symbol (for backtesting)
  fetchHistory: publicQuery
    .input(z.object({
      symbol: z.string().default("BTC/USDT"),
      timeframe: z.string().default("1h"),
      days: z.number().default(200),
    }))
    .query(async ({ input }) => {
      const data = await liveDataFeed.fetchHistory(input.symbol, input.timeframe, input.days);
      return data;
    }),

  runBacktest: publicQuery
    .input(
      z.object({
        symbol: z.string().default("BTC/USDT"),
        timeframe: z.string().default("1h"),
        days: z.number().default(200),
        useML: z.boolean().default(true),
        usePPORL: z.boolean().default(true),
        useRealData: z.boolean().default(true),
        takerFee: z.number().default(0.001),   // 0.1% Binance taker
        slippage: z.number().default(0.0005),   // 0.05% slippage
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id || 1;
      const engine = engines.get(userId);
      if (!engine) return { error: "No active engine. Start the bot first." };

      let data;
      if (input.useRealData) {
        data = await liveDataFeed.fetchHistory(input.symbol, input.timeframe, input.days);
        if (data.length < 50) {
          return { error: "Insufficient historical data fetched. Try fewer days or check connection." };
        }
      }

      const result = engine.runBacktest(
        input.symbol,
        input.days,
        input.useML,
        input.usePPORL,
        data,
        input.takerFee,
        input.slippage
      );
      return result;
    }),
});
