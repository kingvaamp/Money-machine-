import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, TrendingDown, Lock, Percent, Activity } from "lucide-react";

export default function Risk() {
  const riskLimits = [
    { name: "Daily Loss Limit", value: 7, threshold: 7, unit: "%", severity: "critical" as const, description: "Halt trading if daily loss exceeds 7%" },
    { name: "Max Drawdown", value: 15, threshold: 15, unit: "%", severity: "critical" as const, description: "Stop all positions at 15% portfolio drawdown" },
    { name: "Position Size Limit", value: 2, threshold: 2, unit: "%", severity: "warning" as const, description: "No single trade exceeds 2% of capital" },
    { name: "Max Open Positions", value: 10, threshold: 10, unit: "", severity: "warning" as const, description: "Maximum 10 concurrent positions" },
    { name: "Risk Per Trade", value: 2, threshold: 2, unit: "%", severity: "info" as const, description: "Kelly-adjusted position sizing" },
  ];

  const circuitBreakers = [
    { name: "Daily Loss 5%", severity: "warning" as const, status: "Ready" },
    { name: "Daily Loss 7%", severity: "critical" as const, status: "Ready" },
    { name: "Drawdown 10%", severity: "warning" as const, status: "Ready" },
    { name: "Drawdown 15%", severity: "critical" as const, status: "Ready" },
    { name: "Too Many Positions", severity: "warning" as const, status: "Ready" },
  ];

  const drawdownRecovery = [
    { drawdown: "10%", recovery: "11.1%" },
    { drawdown: "20%", recovery: "25.0%" },
    { drawdown: "30%", recovery: "42.9%" },
    { drawdown: "40%", recovery: "66.7%" },
    { drawdown: "50%", recovery: "100.0%" },
    { drawdown: "60%", recovery: "150.0%" },
    { drawdown: "75%", recovery: "300.0%" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk Center</h1>
        <p className="text-slate-400 text-sm mt-1">Bulletproof risk management - where most bots fail</p>
      </div>

      {/* Risk Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-400" />
              Risk Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {riskLimits.map((limit) => (
              <div key={limit.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{limit.name}</div>
                    <div className="text-xs text-slate-400">{limit.description}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      limit.severity === "critical"
                        ? "border-red-500 text-red-400"
                        : limit.severity === "warning"
                        ? "border-amber-500 text-amber-400"
                        : "border-blue-500 text-blue-400"
                    }
                  >
                    {limit.value}{limit.unit}
                  </Badge>
                </div>
                <Progress value={Math.min(100, (limit.value / limit.threshold) * 100)} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Circuit Breakers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {circuitBreakers.map((cb) => (
              <div key={cb.name} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      cb.severity === "critical" ? "bg-red-400" : "bg-amber-400"
                    }`}
                  />
                  <span className="text-sm text-white">{cb.name}</span>
                </div>
                <Badge variant="outline" className="border-emerald-500 text-emerald-400 text-xs">
                  {cb.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Drawdown Recovery Math */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-400" />
            The Math of Recovery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400 mb-4">
            A 50% drawdown requires a 100% gain to recover. A 75% drawdown needs 300% returns.
            Large drawdowns effectively end trading careers.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {drawdownRecovery.map((item) => (
              <div key={item.drawdown} className="p-3 rounded-lg bg-slate-800/50 border border-slate-800 text-center">
                <div className="text-xs text-slate-400">-{item.drawdown} DD</div>
                <div className="text-sm font-bold text-amber-400 mt-1">+{item.recovery}</div>
                <div className="text-xs text-slate-500">to recover</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Position Sizing Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Percent className="h-5 w-5 text-blue-400" />
              Kelly Criterion Sizing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400 mb-4">
              Never risk more than 2% per trade. The Kelly Criterion calculates optimal position size
              based on win rate and average win/loss ratio.
            </p>
            <div className="p-4 rounded-lg bg-slate-800/50 font-mono text-sm space-y-2">
              <div className="text-slate-300">K% = W - (1 - W) / (AvgWin / AvgLoss)</div>
              <div className="text-slate-500 text-xs">Where W = win rate</div>
              <div className="text-emerald-400 text-xs mt-2">Using Half-Kelly for safety margin</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-violet-400" />
              ATR-Based Stops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400 mb-4">
              Volatility-adjusted position sizing using ATR adapts risk to current market conditions,
              preventing oversized positions during volatile periods.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                <span className="text-sm text-slate-300">Stop Loss Distance</span>
                <span className="text-sm font-mono text-white">2x ATR</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                <span className="text-sm text-slate-300">Take Profit Distance</span>
                <span className="text-sm font-mono text-white">3x ATR</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                <span className="text-sm text-slate-300">Trailing Stop Trigger</span>
                <span className="text-sm font-mono text-white">After +5% profit</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Layers Architecture */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" />
            Risk Architecture Layers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-emerald-400 mb-2">1. Signal Layer</div>
              <p className="text-xs text-slate-400">
                Generates trade signals from 5 strategies. ML regime classifier filters which strategies to activate.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-amber-400 mb-2">2. Risk Layer</div>
              <p className="text-xs text-slate-400">
                Sizes positions using Kelly Criterion + ATR. Checks exposure limits, drawdown, and daily loss limits.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-blue-400 mb-2">3. Execution Layer</div>
              <p className="text-xs text-slate-400">
                Places trades via API. Monitors fills, slippage, and latency. Rejects orders if risk checks fail.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-red-400 mb-2">4. Monitoring Layer</div>
              <p className="text-xs text-slate-400">
                Tracks PnL, latency, errors. Activates circuit breakers if limits breached. Sends alerts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
