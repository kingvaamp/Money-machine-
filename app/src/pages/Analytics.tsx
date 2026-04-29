import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp, Target, Zap, Brain, Layers, Shield } from "lucide-react";

export default function Analytics() {
  const strategyPerformance = [
    { strategy: "Trend Following", winRate: 58, avgReturn: 1.2, sharpe: 1.4, maxDD: 8 },
    { strategy: "Mean Reversion", winRate: 62, avgReturn: 0.9, sharpe: 1.8, maxDD: 5 },
    { strategy: "Grid Trading", winRate: 72, avgReturn: 0.6, sharpe: 2.1, maxDD: 3 },
    { strategy: "Arbitrage", winRate: 65, avgReturn: 0.4, sharpe: 2.8, maxDD: 2 },
    { strategy: "Market Making", winRate: 55, avgReturn: 0.3, sharpe: 3.2, maxDD: 1 },
  ];

  const radarData = [
    { metric: "Profitability", value: 85 },
    { metric: "Sharpe Ratio", value: 78 },
    { metric: "Win Rate", value: 72 },
    { metric: "Risk Control", value: 92 },
    { metric: "Diversification", value: 88 },
    { metric: "Adaptability", value: 80 },
  ];

  const allocationData = [
    { name: "Trend Following", value: 25, color: "#10b981" },
    { name: "Mean Reversion", value: 20, color: "#3b82f6" },
    { name: "Grid Trading", value: 20, color: "#f59e0b" },
    { name: "Arbitrage", value: 20, color: "#8b5cf6" },
    { name: "Market Making", value: 15, color: "#ec4899" },
  ];

  const monthlyReturns = [
    { month: "Jan", return: 2.1 },
    { month: "Feb", return: -0.8 },
    { month: "Mar", return: 3.5 },
    { month: "Apr", return: 1.9 },
    { month: "May", return: 4.2 },
    { month: "Jun", return: -1.2 },
    { month: "Jul", return: 2.8 },
    { month: "Aug", return: 3.1 },
    { month: "Sep", return: 0.5 },
    { month: "Oct", return: 2.9 },
    { month: "Nov", return: 1.7 },
    { month: "Dec", return: 3.3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Performance Analytics</h1>
        <p className="text-slate-400 text-sm mt-1">Comprehensive trading performance and strategy attribution</p>
      </div>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {strategyPerformance.map((s) => (
          <Card key={s.strategy} className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4">
              <div className="text-xs text-slate-400">{s.strategy}</div>
              <div className="text-lg font-bold text-white mt-1">{s.winRate}%</div>
              <div className="text-xs text-emerald-400">Win Rate</div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <div>
                  <span className="text-slate-500">Sharpe:</span>{" "}
                  <span className="text-white">{s.sharpe}</span>
                </div>
                <div>
                  <span className="text-slate-500">Max DD:</span>{" "}
                  <span className="text-red-400">{s.maxDD}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-400" />
              Performance Radar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#475569", fontSize: 10 }} />
                <Radar name="Bot" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              Strategy Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  stroke="none"
                >
                  {allocationData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {allocationData.map((item) => (
                <div key={item.name} className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-400">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-400" />
              Monthly Returns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyReturns}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#475569" fontSize={12} />
                <YAxis stroke="#475569" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                />
                <Bar dataKey="return">
                  {monthlyReturns.map((entry, index) => (
                    <Cell key={index} fill={entry.return >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ML Performance */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            ML Layer Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="text-sm font-medium text-white">Regime Classification Accuracy</div>
              <div className="space-y-2">
                {[
                  { regime: "Trending Up", accuracy: 84 },
                  { regime: "Trending Down", accuracy: 81 },
                  { regime: "Ranging", accuracy: 78 },
                  { regime: "Volatile", accuracy: 72 },
                  { regime: "Breakout", accuracy: 69 },
                ].map((r) => (
                  <div key={r.regime} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-24">{r.regime}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400" style={{ width: `${r.accuracy}%` }} />
                    </div>
                    <span className="text-xs text-white w-8">{r.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-white">PPO RL Performance</div>
              <div className="p-3 rounded-lg bg-slate-800/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Reward Function</span>
                  <span className="text-white">Profit + Sharpe - Drawdown</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Clip Epsilon</span>
                  <span className="text-white">0.2</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Learning Rate</span>
                  <span className="text-white">0.001</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Value Weight</span>
                  <span className="text-white">0.5</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Entropy Weight</span>
                  <span className="text-white">0.01</span>
                </div>
              </div>
              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
                34% profitability increase vs single-strategy
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-white">Anti-Overfitting Measures</div>
              <div className="space-y-2">
                {[
                  "Train on bull, bear, and flat markets",
                  "Cross-validation on out-of-sample data",
                  "Regular retraining to avoid strategy drift",
                  "Walk-forward analysis for robustness",
                  "Monte Carlo simulation for stress testing",
                ].map((measure, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-slate-300">{measure}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Technology Stack
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { name: "ccxt", desc: "Exchange connectivity", color: "bg-blue-500" },
              { name: "jesse", desc: "Backtesting framework", color: "bg-emerald-500" },
              { name: "pandas", desc: "Data manipulation", color: "bg-amber-500" },
              { name: "scikit-learn", desc: "ML models (RF, XGB)", color: "bg-orange-500" },
              { name: "stable-baselines3", desc: "RL (PPO, SAC)", color: "bg-violet-500" },
              { name: "optuna", desc: "Hyperparameter opt", color: "bg-pink-500" },
              { name: "PostgreSQL", desc: "Trade logs", color: "bg-cyan-500" },
            ].map((tech) => (
              <div key={tech.name} className="p-3 rounded-lg bg-slate-800/50 border border-slate-800 text-center">
                <div className={`h-2 w-2 rounded-full mx-auto mb-2 ${tech.color}`} />
                <div className="text-sm font-medium text-white">{tech.name}</div>
                <div className="text-xs text-slate-400 mt-1">{tech.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
