import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  decimal,
  int,
  bigint,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const strategies = mysqlTable("strategies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", [
    "trend_following",
    "mean_reversion",
    "grid_trading",
    "arbitrage",
    "market_making",
    "ppo_rl",
  ]).notNull(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  timeframe: varchar("timeframe", { length: 20 }).notNull(),
  parameters: json("parameters").notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  weight: decimal("weight", { precision: 5, scale: 2 }).default("0.20").notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = typeof strategies.$inferInsert;

export const trades = mysqlTable("trades", {
  id: serial("id").primaryKey(),
  strategyId: bigint("strategyId", { mode: "number", unsigned: true }).notNull(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  type: mysqlEnum("type", ["market", "limit", "stop", "grid"]).notNull(),
  entryPrice: decimal("entryPrice", { precision: 18, scale: 8 }).notNull(),
  exitPrice: decimal("exitPrice", { precision: 18, scale: 8 }),
  quantity: decimal("quantity", { precision: 18, scale: 8 }).notNull(),
  pnl: decimal("pnl", { precision: 18, scale: 8 }).default("0"),
  pnlPercent: decimal("pnlPercent", { precision: 10, scale: 4 }).default("0"),
  status: mysqlEnum("status", ["open", "closed", "cancelled"]).default("open").notNull(),
  entryAt: timestamp("entryAt").defaultNow().notNull(),
  exitAt: timestamp("exitAt"),
  stopLoss: decimal("stopLoss", { precision: 18, scale: 8 }),
  takeProfit: decimal("takeProfit", { precision: 18, scale: 8 }),
  metadata: json("metadata"),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

export const positions = mysqlTable("positions", {
  id: serial("id").primaryKey(),
  strategyId: bigint("strategyId", { mode: "number", unsigned: true }).notNull(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  side: mysqlEnum("side", ["long", "short"]).notNull(),
  quantity: decimal("quantity", { precision: 18, scale: 8 }).notNull(),
  avgEntryPrice: decimal("avgEntryPrice", { precision: 18, scale: 8 }).notNull(),
  currentPrice: decimal("currentPrice", { precision: 18, scale: 8 }).notNull(),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 18, scale: 8 }).default("0"),
  unrealizedPnlPercent: decimal("unrealizedPnlPercent", { precision: 10, scale: 4 }).default("0"),
  leverage: decimal("leverage", { precision: 5, scale: 2 }).default("1.00"),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

export const backtests = mysqlTable("backtests", {
  id: serial("id").primaryKey(),
  strategyId: bigint("strategyId", { mode: "number", unsigned: true }).notNull(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  initialCapital: decimal("initialCapital", { precision: 18, scale: 2 }).notNull(),
  finalCapital: decimal("finalCapital", { precision: 18, scale: 2 }).notNull(),
  totalReturn: decimal("totalReturn", { precision: 10, scale: 4 }).notNull(),
  sharpeRatio: decimal("sharpeRatio", { precision: 10, scale: 4 }),
  maxDrawdown: decimal("maxDrawdown", { precision: 10, scale: 4 }).notNull(),
  winRate: decimal("winRate", { precision: 5, scale: 2 }).notNull(),
  totalTrades: int("totalTrades").notNull(),
  profitableTrades: int("profitableTrades").notNull(),
  avgTradeReturn: decimal("avgTradeReturn", { precision: 10, scale: 4 }),
  volatility: decimal("volatility", { precision: 10, scale: 4 }),
  parameters: json("parameters").notNull(),
  tradesData: json("tradesData"),
  equityCurve: json("equityCurve"),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Backtest = typeof backtests.$inferSelect;
export type InsertBacktest = typeof backtests.$inferInsert;

export const performanceMetrics = mysqlTable("performance_metrics", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  totalEquity: decimal("totalEquity", { precision: 18, scale: 2 }).notNull(),
  dailyPnl: decimal("dailyPnl", { precision: 18, scale: 2 }).default("0"),
  dailyReturn: decimal("dailyReturn", { precision: 10, scale: 4 }).default("0"),
  cumulativeReturn: decimal("cumulativeReturn", { precision: 10, scale: 4 }).default("0"),
  sharpeRatio: decimal("sharpeRatio", { precision: 10, scale: 4 }),
  sortinoRatio: decimal("sortinoRatio", { precision: 10, scale: 4 }),
  maxDrawdown: decimal("maxDrawdown", { precision: 10, scale: 4 }).default("0"),
  currentDrawdown: decimal("currentDrawdown", { precision: 10, scale: 4 }).default("0"),
  winRate: decimal("winRate", { precision: 5, scale: 2 }).default("0"),
  profitFactor: decimal("profitFactor", { precision: 10, scale: 4 }),
  totalTrades: int("totalTrades").default(0),
  openPositions: int("openPositions").default(0),
  activeStrategies: int("activeStrategies").default(0),
  avgPositionSize: decimal("avgPositionSize", { precision: 18, scale: 8 }),
  avgHoldingTime: decimal("avgHoldingTime", { precision: 10, scale: 2 }),
  volatility: decimal("volatility", { precision: 10, scale: 4 }),
  calmarRatio: decimal("calmarRatio", { precision: 10, scale: 4 }),
});

export type PerformanceMetric = typeof performanceMetrics.$inferSelect;
export type InsertPerformanceMetric = typeof performanceMetrics.$inferInsert;

export const riskEvents = mysqlTable("risk_events", {
  id: serial("id").primaryKey(),
  type: mysqlEnum("type", [
    "stop_loss",
    "take_profit",
    "circuit_breaker",
    "position_limit",
    "drawdown_limit",
    "volatility_alert",
    "manual_override",
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).notNull(),
  symbol: varchar("symbol", { length: 50 }),
  strategyId: bigint("strategyId", { mode: "number", unsigned: true }),
  message: text("message").notNull(),
  value: decimal("value", { precision: 18, scale: 8 }),
  threshold: decimal("threshold", { precision: 18, scale: 8 }),
  isResolved: boolean("isResolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type RiskEvent = typeof riskEvents.$inferSelect;
export type InsertRiskEvent = typeof riskEvents.$inferInsert;

export const marketData = mysqlTable("market_data", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  timeframe: varchar("timeframe", { length: 20 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  open: decimal("open", { precision: 18, scale: 8 }).notNull(),
  high: decimal("high", { precision: 18, scale: 8 }).notNull(),
  low: decimal("low", { precision: 18, scale: 8 }).notNull(),
  close: decimal("close", { precision: 18, scale: 8 }).notNull(),
  volume: decimal("volume", { precision: 24, scale: 8 }).notNull(),
  volatility: decimal("volatility", { precision: 10, scale: 4 }),
  atr: decimal("atr", { precision: 18, scale: 8 }),
});

export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = typeof marketData.$inferInsert;

export const signals = mysqlTable("signals", {
  id: serial("id").primaryKey(),
  strategyId: bigint("strategyId", { mode: "number", unsigned: true }).notNull(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["entry", "exit", "hold", "grid_entry", "grid_exit"]).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  price: decimal("price", { precision: 18, scale: 8 }).notNull(),
  quantity: decimal("quantity", { precision: 18, scale: 8 }),
  indicators: json("indicators"),
  regime: mysqlEnum("regime", [
    "trending_up",
    "trending_down",
    "ranging",
    "volatile",
    "breakout",
  ]),
  executed: boolean("executed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

export const botConfig = mysqlTable("bot_config", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().unique(),
  isRunning: boolean("isRunning").default(false).notNull(),
  mode: mysqlEnum("mode", ["paper", "live"]).default("paper").notNull(),
  maxDailyLoss: decimal("maxDailyLoss", { precision: 5, scale: 2 }).default("7.00").notNull(),
  maxPositionSize: decimal("maxPositionSize", { precision: 5, scale: 2 }).default("2.00").notNull(),
  maxOpenPositions: int("maxOpenPositions").default(10).notNull(),
  defaultStopLoss: decimal("defaultStopLoss", { precision: 5, scale: 2 }).default("3.00").notNull(),
  defaultTakeProfit: decimal("defaultTakeProfit", { precision: 5, scale: 2 }).default("6.00").notNull(),
  useMLRegime: boolean("useMLRegime").default(true).notNull(),
  usePPORL: boolean("usePPORL").default(true).notNull(),
  useSentiment: boolean("useSentiment").default(false).notNull(),
  capital: decimal("capital", { precision: 18, scale: 2 }).default("100000.00").notNull(),
  riskPerTrade: decimal("riskPerTrade", { precision: 5, scale: 2 }).default("2.00").notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = typeof botConfig.$inferInsert;
