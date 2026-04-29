import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { BarChart3, Play, Clock, TrendingUp } from "lucide-react";

export default function Backtest() {
  const [params, setParams] = useState({
    symbol: "BTCUSDT",
    days: 500,
    useML: true,
    usePPORL: true,
  });
  const [result, setResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  const backtestMutation = trpc.trading.runBacktest.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setIsRunning(false);
    },
    onError: () => setIsRunning(false),
  });

  const handleRun = () => {
    setIsRunning(true);
    backtestMutation.mutate(params);
  };

  const equityData = result?.equityCurve?.map((e: any, i: number) => ({
    day: i,
    equity: e.equity,
  })) || [];

  const tradeData = result?.trades?.map((t: any, i: number) => ({
    index: i,
    pnl: t.pnl,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Backtest Lab</h1>
          <p className="text-slate-400 text-sm mt-1">Simulate strategy performance with realistic slippage, fees, and market conditions</p>
        </div>
      </div>

      {/* Parameters */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            Backtest Parameters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-slate-300">Symbol</Label>
              <Input
                value={params.symbol}
                onChange={(e) => setParams({ ...params, symbol: e.target.value.toUpperCase() })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Days of Data</Label>
              <Input
                type="number"
                value={params.days}
                onChange={(e) => setParams({ ...params, days: parseInt(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={params.useML} onCheckedChange={(v) => setParams({ ...params, useML: v })} />
              <div>
                <div className="text-sm text-white">Use ML Regime</div>
                <div className="text-xs text-slate-400">Random Forest classifier</div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={params.usePPORL} onCheckedChange={(v) => setParams({ ...params, usePPORL: v })} />
              <div>
                <div className="text-sm text-white">Use PPO RL</div>
                <div className="text-xs text-slate-400">Dynamic strategy allocation</div>
              </div>
            </div>
          </div>
          <Button
            onClick={handleRun}
            disabled={isRunning}
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
          >
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? "Running..." : "Run Backtest"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="text-xs text-slate-400">Total Return</div>
                <div className={`text-xl font-bold ${result.totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {result.totalReturn >= 0 ? "+" : ""}{result.totalReturn.toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="text-xs text-slate-400">Sharpe Ratio</div>
                <div className="text-xl font-bold text-white">{result.sharpeRatio.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="text-xs text-slate-400">Max Drawdown</div>
                <div className="text-xl font-bold text-red-400">-{(result.maxDrawdown * 100).toFixed(2)}%</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="text-xs text-slate-400">Win Rate</div>
                <div className="text-xl font-bold text-white">{result.winRate.toFixed(1)}%</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="text-xs text-slate-400">Total Trades</div>
                <div className="text-xl font-bold text-white">{result.totalTrades}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="text-xs text-slate-400">Volatility</div>
                <div className="text-xl font-bold text-amber-400">{result.volatility.toFixed(1)}%</div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  Equity Curve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                      labelStyle={{ color: "#94a3b8" }}
                    />
                    <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                  Trade PnL Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={tradeData.slice(0, 50)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="index" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                      labelStyle={{ color: "#94a3b8" }}
                    />
                    <Bar dataKey="pnl">
                      {tradeData.slice(0, 50).map((_: any, i: number) => (
                        <Cell key={i} fill={_.pnl >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Trades Table */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="text-left py-2">Side</th>
                      <th className="text-left py-2">Entry</th>
                      <th className="text-left py-2">Exit</th>
                      <th className="text-right py-2">PnL</th>
                      <th className="text-right py-2">Return</th>
                      <th className="text-left py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades?.slice(0, 20).map((trade: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50">
                        <td className="py-2">
                          <Badge variant="outline" className={trade.side === "buy" ? "border-emerald-500 text-emerald-400" : "border-red-500 text-red-400"}>
                            {trade.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2 text-white">${trade.entryPrice.toFixed(2)}</td>
                        <td className="py-2 text-white">${trade.exitPrice?.toFixed(2) || "-"}</td>
                        <td className={`py-2 text-right ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                        </td>
                        <td className={`py-2 text-right ${trade.pnlPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {trade.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="py-2 text-slate-400">{trade.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
