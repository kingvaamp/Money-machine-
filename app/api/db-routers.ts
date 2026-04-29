import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

interface Strategy {
  id: number;
  userId: number;
  name: string;
  type: string;
  symbol: string;
  timeframe: string;
  parameters: Record<string, unknown>;
  isActive: boolean;
  weight?: number | string;
  createdAt: Date;
  updatedAt: Date;
}

interface Backtest {
  id: number;
  userId?: number;
  strategyId?: number;
  symbol: string;
  startDate: string | Date;
  endDate: string | Date;
  initialCapital: number | string;
  finalCapital: number | string;
  totalReturn: number | string;
  maxDrawdown: number | string;
  winRate: number | string;
  trades?: number;
  sharpeRatio?: number | string;
  avgTradeReturn?: number | string;
  equityCurve?: number[];
  createdAt?: Date;
}

interface Signal {
  id: number;
  strategyId: number;
  type: string;
  symbol: string;
  price: number;
  confidence: number;
  timestamp: Date;
  createdAt?: Date;
}

interface MarketData {
  symbol: string;
  price: number;
  timestamp: Date;
  timeframe?: string;
}

// --- In-Memory Stores ---
let localStrategies: Strategy[] = [];
let strategyIdCounter = 1;

let localBacktests: Backtest[] = [];
let backtestIdCounter = 1;

const localSignals: Signal[] = [];
const localMarketData: MarketData[] = [];
// ------------------------

export const strategyRouter = createRouter({
  list: publicQuery.query(async ({ ctx }) => {
    const userId = ctx.user?.id || 1;
    return localStrategies
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }),

  create: publicQuery
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["trend_following", "mean_reversion", "grid_trading", "arbitrage", "market_making", "ppo_rl"]),
        symbol: z.string().default("BTCUSDT"),
        timeframe: z.string().default("1h"),
        parameters: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).default({}),
        weight: z.number().default(0.2),
        isActive: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id || 1;
      const newStrategy = {
        ...input,
        id: strategyIdCounter++,
        userId,
        weight: input.weight.toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      localStrategies.push(newStrategy);
      return { success: true, id: newStrategy.id };
    }),

  update: publicQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        parameters: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
        weight: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...update } = input;
      const idx = localStrategies.findIndex((s) => s.id === id);
      if (idx !== -1) {
        localStrategies[idx] = {
          ...localStrategies[idx],
          ...update,
          weight: update.weight !== undefined ? update.weight.toString() : localStrategies[idx].weight,
          updatedAt: new Date(),
        };
      }
      return { success: true };
    }),

  delete: publicQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    localStrategies = localStrategies.filter((s) => s.id !== input.id);
    return { success: true };
  }),

  toggle: publicQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const strategy = localStrategies.find((s) => s.id === input.id);
    if (!strategy) return { success: false, error: "Not found" };
    strategy.isActive = !strategy.isActive;
    strategy.updatedAt = new Date();
    return { success: true, isActive: strategy.isActive };
  }),
});

export const backtestRouter = createRouter({
  list: publicQuery.query(async () => {
    return localBacktests
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 50);
  }),

  get: publicQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return localBacktests.find((b) => b.id === input.id) || null;
  }),

  save: publicQuery
    .input(
      z.object({
        strategyId: z.number(),
        symbol: z.string(),
        startDate: z.date(),
        endDate: z.date(),
        initialCapital: z.number(),
        finalCapital: z.number(),
        totalReturn: z.number(),
        sharpeRatio: z.number().optional(),
        maxDrawdown: z.number(),
        winRate: z.number(),
        totalTrades: z.number(),
        profitableTrades: z.number(),
        avgTradeReturn: z.number().optional(),
        volatility: z.number().optional(),
        parameters: z.record(z.string(), z.any()),
        tradesData: z.any().optional(),
        equityCurve: z.any().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const newBacktest = {
        ...input,
        id: backtestIdCounter++,
        initialCapital: input.initialCapital.toString(),
        finalCapital: input.finalCapital.toString(),
        totalReturn: input.totalReturn.toString(),
        sharpeRatio: input.sharpeRatio?.toString(),
        maxDrawdown: input.maxDrawdown.toString(),
        winRate: input.winRate.toString(),
        avgTradeReturn: input.avgTradeReturn?.toString(),
        volatility: input.volatility?.toString(),
        status: "completed",
        createdAt: new Date(),
      };
      localBacktests.push(newBacktest);
      return { success: true, id: newBacktest.id };
    }),

  delete: publicQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    localBacktests = localBacktests.filter((b) => b.id !== input.id);
    return { success: true };
  }),
});

export const signalRouter = createRouter({
  list: publicQuery.query(async () => {
    return localSignals
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 100);
  }),

  recent: publicQuery
    .input(z.object({ strategyId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      let res = localSignals;
      if (input.strategyId) {
        res = res.filter((s) => s.strategyId === input.strategyId);
      }
      return res
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
        .slice(0, input.limit);
    }),
});

export const marketRouter = createRouter({
  getData: publicQuery
    .input(z.object({ symbol: z.string(), timeframe: z.string().default("1h"), limit: z.number().default(200) }))
    .query(async ({ input }) => {
      return localMarketData
        .filter((m) => m.symbol === input.symbol && m.timeframe === input.timeframe)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, input.limit);
    }),
});
