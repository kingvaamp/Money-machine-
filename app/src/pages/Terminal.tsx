import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Clock, Activity } from "lucide-react";

export default function Terminal() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [isRunning, setIsRunning] = useState(false);

  const marketData = trpc.trading.getMarketData.useQuery({ symbol }, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const botState = trpc.trading.getState.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const positions = trpc.trading.getPositions.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
  });
  const signals = trpc.trading.getSignals.useQuery(undefined, {
    refetchInterval: isRunning ? 3000 : false,
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

  const data = marketData.data || [];
  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const change = latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : 0;

  const handleTick = () => {
    tick.mutate({ symbol });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Terminal</h1>
          <p className="text-slate-400 text-sm mt-1">Live market data and manual trading controls</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-32 bg-slate-800 border-slate-700 text-white"
          />
          <Button variant="outline" className="border-slate-700 text-slate-300" onClick={handleTick}>
            <Activity className="h-4 w-4 mr-2" />
            Tick
          </Button>
          <Button
            variant={isRunning ? "destructive" : "default"}
            onClick={() => (isRunning ? stopBot.mutate() : startBot.mutate({ mode: "paper", symbol, capital: 100000 }))}
            className={isRunning ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
          >
            {isRunning ? "Stop" : "Start"}
          </Button>
        </div>
      </div>

      {/* Price Display */}
      {latest && (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-white">${latest.close.toFixed(2)}</div>
                <div className="flex items-center gap-2 mt-1">
                  {change >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-400" />
                  )}
                  <span className={`text-sm font-medium ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    O: {latest.open.toFixed(2)} H: {latest.high.toFixed(2)} L: {latest.low.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Volume</div>
                <div className="text-lg font-medium text-white">{latest.volume.toFixed(0)}</div>
                <div className="text-xs text-slate-400">{new Date(latest.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Book Style Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ArrowDown className="h-5 w-5 text-red-400" />
              Bids
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latest && (
              <div className="space-y-1">
                {[0.001, 0.002, 0.003, 0.004, 0.005].map((offset, i) => {
                  const price = latest.close * (1 - offset);
                  const size = 0.5 + Math.random() * 2;
                  return (
                    <div key={i} className="flex items-center justify-between py-1 px-2 rounded hover:bg-red-500/5">
                      <span className="text-sm text-red-400">{price.toFixed(2)}</span>
                      <span className="text-sm text-slate-400">{size.toFixed(4)}</span>
                      <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-red-400/30" style={{ width: `${(size / 2.5) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ArrowUp className="h-5 w-5 text-emerald-400" />
              Asks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latest && (
              <div className="space-y-1">
                {[0.001, 0.002, 0.003, 0.004, 0.005].map((offset, i) => {
                  const price = latest.close * (1 + offset);
                  const size = 0.5 + Math.random() * 2;
                  return (
                    <div key={i} className="flex items-center justify-between py-1 px-2 rounded hover:bg-emerald-500/5">
                      <span className="text-sm text-emerald-400">{price.toFixed(2)}</span>
                      <span className="text-sm text-slate-400">{size.toFixed(4)}</span>
                      <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-emerald-400/30" style={{ width: `${(size / 2.5) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Signals */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Signal Stream
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">Strategy</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Side</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {signals.data?.slice(-20).map((signal, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="py-2 text-slate-400">{new Date().toLocaleTimeString()}</td>
                    <td className="py-2 text-white">{signal.strategy}</td>
                    <td className="py-2">
                      <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                        {signal.type}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className={signal.side === "buy" ? "border-emerald-500 text-emerald-400" : "border-red-500 text-red-400"}>
                        {signal.side.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2 text-right text-white">${signal.price.toFixed(2)}</td>
                    <td className="py-2 text-right text-white">{(signal.confidence * 100).toFixed(0)}%</td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No signals. Start the bot to generate signals.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Positions */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            Open Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {positions.data && positions.data.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {positions.data.map((pos) => (
                <div key={pos.id} className="p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={pos.side === "long" ? "border-emerald-500 text-emerald-400" : "border-red-500 text-red-400"}>
                      {pos.side.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-slate-400">{pos.symbol}</span>
                  </div>
                  <div className="mt-2 text-lg font-bold text-white">{Number(pos.quantity).toFixed(4)}</div>
                  <div className="text-xs text-slate-400">@ ${Number(pos.avgEntryPrice).toFixed(2)}</div>
                  <div className={`text-sm mt-1 ${Number(pos.unrealizedPnl) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {Number(pos.unrealizedPnl) >= 0 ? "+" : ""}${Number(pos.unrealizedPnl).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">No open positions</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
