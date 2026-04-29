import { relations } from "drizzle-orm";
import { users, strategies, trades, positions, backtests, performanceMetrics, riskEvents, signals, botConfig } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  strategies: many(strategies),
  performanceMetrics: many(performanceMetrics),
  botConfig: many(botConfig),
}));

export const strategiesRelations = relations(strategies, ({ one, many }) => ({
  user: one(users, {
    fields: [strategies.userId],
    references: [users.id],
  }),
  trades: many(trades),
  positions: many(positions),
  backtests: many(backtests),
  signals: many(signals),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  strategy: one(strategies, {
    fields: [trades.strategyId],
    references: [strategies.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  strategy: one(strategies, {
    fields: [positions.strategyId],
    references: [strategies.id],
  }),
}));

export const backtestsRelations = relations(backtests, ({ one }) => ({
  strategy: one(strategies, {
    fields: [backtests.strategyId],
    references: [strategies.id],
  }),
}));

export const signalsRelations = relations(signals, ({ one }) => ({
  strategy: one(strategies, {
    fields: [signals.strategyId],
    references: [strategies.id],
  }),
}));

export const performanceMetricsRelations = relations(performanceMetrics, ({ one }) => ({
  user: one(users, {
    fields: [performanceMetrics.userId],
    references: [users.id],
  }),
}));

export const botConfigRelations = relations(botConfig, ({ one }) => ({
  user: one(users, {
    fields: [botConfig.userId],
    references: [users.id],
  }),
}));

export const riskEventsRelations = relations(riskEvents, ({ one }) => ({
  strategy: one(strategies, {
    fields: [riskEvents.strategyId],
    references: [strategies.id],
  }),
}));
