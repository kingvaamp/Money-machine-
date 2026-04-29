import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, TrendingUp, RotateCcw, Grid3X3, ArrowLeftRight, Layers, Plus, Trash2 } from "lucide-react";

const strategyTypes = [
  { value: "trend_following", label: "Trend Following", icon: TrendingUp, desc: "Moving averages, momentum indicators. Best in strong directional markets." },
  { value: "mean_reversion", label: "Mean Reversion", icon: RotateCcw, desc: "Exploits price deviations from historical averages. Ideal for volatile markets." },
  { value: "grid_trading", label: "Grid Trading", icon: Grid3X3, desc: "Places buy/sell orders at fixed intervals. Generates 9-21% in down markets." },
  { value: "arbitrage", label: "Arbitrage", icon: ArrowLeftRight, desc: "Statistical arbitrage exploiting price deviations from mean." },
  { value: "market_making", label: "Market Making", icon: Layers, desc: "Provides liquidity by placing simultaneous buy/sell orders." },
];

const defaultParams: Record<string, Record<string, number>> = {
  trend_following: { fastPeriod: 20, slowPeriod: 50, rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30 },
  mean_reversion: { bbPeriod: 20, bbStdDev: 2, rsiPeriod: 14 },
  grid_trading: { gridLevels: 10, gridRange: 0.05 },
  arbitrage: { lookback: 20, threshold: 0.003 },
  market_making: { spread: 0.001, depth: 3 },
};

export default function Strategies() {
  const utils = trpc.useUtils();
  const strategies = trpc.strategy.list.useQuery();
  const createStrategy = trpc.strategy.create.useMutation({ onSuccess: () => utils.strategy.list.invalidate() });
  const toggleStrategy = trpc.strategy.toggle.useMutation({ onSuccess: () => utils.strategy.list.invalidate() });
  const deleteStrategy = trpc.strategy.delete.useMutation({ onSuccess: () => utils.strategy.list.invalidate() });
  const setTradingStrategies = trpc.trading.setStrategies.useMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    name: "",
    type: "trend_following" as const,
    symbol: "BTCUSDT",
    timeframe: "1h",
    weight: 0.2,
    isActive: false,
  });

  const handleCreate = () => {
    if (!newStrategy.name) return;
    createStrategy.mutate({
      ...newStrategy,
      parameters: defaultParams[newStrategy.type] || {},
    });
    setIsOpen(false);
    setNewStrategy({ name: "", type: "trend_following", symbol: "BTCUSDT", timeframe: "1h", weight: 0.2, isActive: false });
  };

  const syncToEngine = () => {
    if (!strategies.data) return;
    const configs = strategies.data.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      symbol: s.symbol,
      timeframe: s.timeframe,
      parameters: s.parameters as Record<string, number | boolean | string>,
      weight: Number(s.weight),
      isActive: s.isActive,
    }));
    setTradingStrategies.mutate(configs);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Strategy Stack</h1>
          <p className="text-slate-400 text-sm mt-1">Configure and manage your 5-strategy ensemble with ML optimization</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-slate-700 text-slate-300" onClick={syncToEngine}>
            <Brain className="h-4 w-4 mr-2" />
            Sync to Engine
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Strategy
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-white">Add New Strategy</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="text-slate-300">Name</Label>
                  <Input
                    value={newStrategy.name}
                    onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                    placeholder="e.g., Bitcoin Trend Hunter"
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Strategy Type</Label>
                  <Select value={newStrategy.type} onValueChange={(v) => setNewStrategy({ ...newStrategy, type: v as any })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {strategyTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-white">
                          <div className="flex items-center gap-2">
                            <t.icon className="h-4 w-4" />
                            {t.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-300">Symbol</Label>
                    <Input
                      value={newStrategy.symbol}
                      onChange={(e) => setNewStrategy({ ...newStrategy, symbol: e.target.value.toUpperCase() })}
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Timeframe</Label>
                    <Select value={newStrategy.timeframe} onValueChange={(v) => setNewStrategy({ ...newStrategy, timeframe: v })}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
                          <SelectItem key={tf} value={tf} className="text-white">{tf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300">Weight ({newStrategy.weight.toFixed(2)})</Label>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={newStrategy.weight}
                    onChange={(e) => setNewStrategy({ ...newStrategy, weight: parseFloat(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleCreate} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  Create Strategy
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategyTypes.map((type) => {
          const instances = strategies.data?.filter((s) => s.type === type.value) || [];
          const typeInfo = strategyTypes.find((t) => t.value === type.value);
          const Icon = typeInfo?.icon || Brain;

          return (
            <Card key={type.value} className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-800">
                      <Icon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">{type.label}</CardTitle>
                      <p className="text-xs text-slate-400">{instances.length} instance(s)</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                    {type.value}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-400">{type.desc}</p>
                {instances.length > 0 ? (
                  <div className="space-y-2">
                    {instances.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-slate-800">
                        <div>
                          <div className="text-sm font-medium text-white">{s.name}</div>
                          <div className="text-xs text-slate-400">
                            {s.symbol} / {s.timeframe} / Weight: {Number(s.weight).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={s.isActive}
                            onCheckedChange={() => toggleStrategy.mutate({ id: s.id })}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-400"
                            onClick={() => deleteStrategy.mutate({ id: s.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-500 text-xs">No instances configured</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Strategy Info Cards */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            How Strategy Selection Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-white mb-2">1. Regime Classification</div>
              <p className="text-xs text-slate-400">
                Random Forest classifier analyzes volatility, trend strength, and volume to identify market regime
                (trending up/down, ranging, volatile, breakout).
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-white mb-2">2. PPO RL Allocation</div>
              <p className="text-xs text-slate-400">
                Proximal Policy Optimization dynamically allocates capital across strategies based on recent Sharpe ratio,
                drawdown, and win rate performance.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="text-sm font-medium text-white mb-2">3. Signal Ensembling</div>
              <p className="text-xs text-slate-400">
                Signals from all active strategies are weighted by PPO allocation and regime match confidence,
                with sentiment boost when LLM layer is enabled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
