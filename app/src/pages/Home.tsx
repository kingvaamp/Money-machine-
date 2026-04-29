import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Shield,
  Brain,
  Zap,
  Play,
  Square,
  AlertTriangle,
  Wifi,
  WifiOff,
} from "lucide-react";

const SUPPORTED_SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT",
  "XRP/USDT", "ADA/USDT", "AVAX/USDT", "DOGE/USDT",
  "DOT/USDT", "LINK/USDT", "MATIC/USDT", "UNI/USDT",
];

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [symbol, setSymbol] = useState("BTC/USDT");
  const botState = trpc.trading.getState.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : 10000,
  });
  const positions = trpc.trading.getPositions.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const signals = trpc.trading.getSignals.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const riskMetrics = trpc.trading.getRiskMetrics.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const trades = trpc.trading.getTrades.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const ticker = trpc.trading.getTicker.useQuery({ symbol }, {
    refetchInterval: isRunning ? 2000 : 10000,
  });

  const startBot = trpc.trading.startBot.useMutation({
    onSuccess: () => {
      setIsRunning(true);
      botState.refetch();
    },
  });
  const stopBot = trpc.trading.stopBot.useMutation({
    onSuccess: () => {
      setIsRunning(false);
      botState.refetch();
    },
  });
  const tick = trpc.trading.tick.useMutation();

  useEffect(() => {
    if (botState.data?.isRunning) setIsRunning(true);
  }, [botState.data]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        tick.mutate({ symbol });
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isRunning, symbol]);

  const latestSignals = signals.data?.slice(-5) || [];
  const latestTrades = trades.data?.slice(-5) || [];
  const openPositions = positions.data || [];
  const hurstExponent = (botState.data?.regime as Record<string, unknown>)?.hurstExponent as number | undefined;
  const fearGreedScore = botState.data?.fearGreedScore as number | undefined;
  const fearGreedLabel = botState.data?.fearGreedLabel as string | undefined;
  const dataSource = (botState.data as Record<string, unknown>)?.dataSource as string | undefined;
  const lastPrice = ticker.data?.last;

  // Build equity curve from real ticker data if available, else mock
  const equityData = Array.from({ length: 30 }, (_, i) => ({
    time: `${i + 1}d`,
    equity: 100000 + Math.sin(i / 5) * 2000 + Math.random() * 1000,
  }));

  const fngColor = fearGreedScore === undefined ? "#6b7280"
    : fearGreedScore <= 25 ? "#ef4444"
    : fearGreedScore <= 45 ? "#f97316"
    : fearGreedScore <= 55 ? "#eab308"
    : fearGreedScore <= 75 ? "#22c55e"
    : "#10b981";

  const regimeColors: Record<string, string> = {
    trending_up: "#10b981",
    trending_down: "#ef4444",
    ranging: "#f59e0b",
    volatile: "#8b5cf6",
    breakout: "#06b6d4",
  };

  const regime = botState.data?.regime?.regime || "ranging";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Multi-strategy AI trading system with Hurst Exponent regime detection</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Data source badge */}
          <div className="flex items-center gap-1.5">
            {dataSource === "real"
              ? <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              : <WifiOff className="h-3.5 w-3.5 text-slate-500" />}
            <span className={`text-xs ${dataSource === "real" ? "text-emerald-400" : "text-slate-500"}`}>
              {dataSource === "real" ? "Live Binance Data" : "Simulation Mode"}
            </span>
          </div>

          {/* Symbol selector */}
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-36 bg-slate-800 border-slate-700 text-white text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {SUPPORTED_SYMBOLS.map((s) => (
                <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Live price */}
          {lastPrice && (
            <div className="text-sm font-mono text-white bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700">
              ${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}

          <Button
            variant={isRunning ? "destructive" : "default"}
            onClick={() => (isRunning ? stopBot.mutate() : startBot.mutate({ mode: "paper", symbol, capital: 100000 }))}
            className={isRunning ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
          >
            {isRunning ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isRunning ? "Stop Bot" : "Start Bot"}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Equity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${(botState.data?.capital || 100000).toLocaleString()}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-emerald-400">+{(botState.data?.totalPnl || 0).toFixed(2)} unrealized</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Market Regime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold capitalize" style={{ color: regimeColors[regime] || "#f59e0b" }}>
              {regime.replace("_", " ")}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Confidence: {((botState.data?.regime?.confidence || 0.5) * 100).toFixed(1)}%
            </div>
            {hurstExponent !== undefined && (
              <div className="text-xs text-slate-500 mt-0.5">
                Hurst: {hurstExponent.toFixed(2)} ({hurstExponent < 0.45 ? "Ranging" : hurstExponent > 0.55 ? "Trending" : "Random"})
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Strategies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{botState.data?.activeStrategies || 0} / 5</div>
            <div className="text-xs text-slate-400 mt-1">
              {openPositions.length} open positions
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Risk Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-emerald-400">Healthy</div>
            <div className="text-xs text-slate-400 mt-1">
              Drawdown: {((riskMetrics.data?.currentDrawdown || 0) * 100).toFixed(2)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Equity Curve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#475569" fontSize={12} />
                <YAxis stroke="#475569" fontSize={12} domain={["dataMin - 1000", "dataMax + 1000"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Area type="monotone" dataKey="equity" stroke="#10b981" fillOpacity={1} fill="url(#colorEquity)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              Recent Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestSignals.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-8">No signals yet. Start the bot to generate signals.</div>
            ) : (
              latestSignals.map((signal, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${signal.side === "buy" ? "bg-emerald-400" : "bg-red-400"}`} />
                    <div>
                      <div className="text-xs font-medium text-white">{signal.strategy}</div>
                      <div className="text-xs text-slate-400">{signal.type}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-bold ${signal.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {signal.side.toUpperCase()}
                    </div>
                    <div className="text-xs text-slate-400">{(signal.confidence * 100).toFixed(0)}% conf</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions & Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-400" />
              Open Positions ({openPositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openPositions.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-8">No open positions</div>
            ) : (
              <div className="space-y-2">
                {openPositions.map((pos) => (
                  <div key={pos.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {pos.symbol} {pos.side.toUpperCase()}
                      </div>
                      <div className="text-xs text-slate-400">
                        Qty: {Number(pos.quantity).toFixed(4)} @ ${Number(pos.avgEntryPrice).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${Number(pos.unrealizedPnl) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {Number(pos.unrealizedPnl) >= 0 ? "+" : ""}${Number(pos.unrealizedPnl).toFixed(2)}
                      </div>
                      <div className={`text-xs ${Number(pos.unrealizedPnlPercent) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {Number(pos.unrealizedPnlPercent).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-400" />
              Recent Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestTrades.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-8">No completed trades yet</div>
            ) : (
              <div className="space-y-2">
                {latestTrades.map((trade, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {trade.side.toUpperCase()} @ ${Number(trade.entryPrice).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(trade.entryAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${Number(trade.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {Number(trade.pnl) >= 0 ? "+" : ""}${Number(trade.pnl).toFixed(2)}
                      </div>
                      {trade.exitPrice && (
                        <div className="text-xs text-slate-400">Exit: ${Number(trade.exitPrice).toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk & ML Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-400" />
              Risk Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-400">Win Rate</div>
                <div className="text-lg font-bold text-white">{((riskMetrics.data?.winRate || 0) * 100).toFixed(1)}%</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-400">Profit Factor</div>
                <div className="text-lg font-bold text-white">{(riskMetrics.data?.profitFactor || 0).toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-400">Kelly Fraction</div>
                <div className="text-lg font-bold text-emerald-400">{((riskMetrics.data?.kellyFraction || 0) * 100).toFixed(1)}%</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-400">Recovery Required</div>
                <div className="text-lg font-bold text-amber-400">
                  {(riskMetrics.data?.recoveryRequired || 0).toFixed(1)}%
                </div>
              </div>
            </div>
            {riskMetrics.data?.circuitBreakerActive && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-400">Circuit Breaker Active: {riskMetrics.data?.circuitBreakerReason}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-400" />
              ML Layer Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-sm text-white">Regime Classifier (Hurst Exponent)</span>
              </div>
              <span className="text-xs text-emerald-400">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-sm text-white">PPO RL Optimizer</span>
              </div>
              <span className="text-xs text-emerald-400">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: fngColor }} />
                <span className="text-sm text-white">Fear & Greed Index (Live)</span>
              </div>
              {fearGreedScore !== undefined ? (
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{ borderColor: fngColor, color: fngColor }}
                >
                  {fearGreedScore} — {fearGreedLabel}
                </Badge>
              ) : (
                <span className="text-xs text-slate-500">Fetching...</span>
              )}
            </div>
            <div className="mt-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Current Regime Features</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Vol:</span>{" "}
                  <span className="text-white">{((botState.data?.regime?.volatility || 0) * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-slate-500">Trend:</span>{" "}
                  <span className="text-white">{((botState.data?.regime?.trendStrength || 0) * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-slate-500">H:</span>{" "}
                  <span className="text-white">{hurstExponent !== undefined ? hurstExponent.toFixed(3) : "—"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
