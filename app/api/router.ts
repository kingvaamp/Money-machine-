import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { tradingRouter } from "./trading-router";
import { strategyRouter, backtestRouter, signalRouter, marketRouter } from "./db-routers";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  trading: tradingRouter,
  strategy: strategyRouter,
  backtest: backtestRouter,
  signal: signalRouter,
  market: marketRouter,
});

export type AppRouter = typeof appRouter;
