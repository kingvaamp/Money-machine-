import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Cloud, Database, Bell, Server } from "lucide-react";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    mode: "paper" as "paper" | "live",
    capital: 100000,
    maxDailyLoss: 7,
    maxPositionSize: 2,
    maxOpenPositions: 10,
    riskPerTrade: 2,
    useMLRegime: true,
    usePPORL: true,
    useSentiment: false,
    notifications: true,
    autoStart: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Configure bot behavior, risk parameters, and integrations</p>
      </div>

      {/* Trading Settings */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-400" />
            Trading Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-slate-300">Trading Mode</Label>
              <Select
                value={config.mode}
                onValueChange={(v) => setConfig({ ...config, mode: v as "paper" | "live" })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="paper" className="text-white">Paper Trading</SelectItem>
                  <SelectItem value="live" className="text-white">Live Trading</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Capital ($)</Label>
              <Input
                type="number"
                value={config.capital}
                onChange={(e) => setConfig({ ...config, capital: parseFloat(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Max Daily Loss (%)</Label>
              <Input
                type="number"
                value={config.maxDailyLoss}
                onChange={(e) => setConfig({ ...config, maxDailyLoss: parseFloat(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Risk Per Trade (%)</Label>
              <Input
                type="number"
                value={config.riskPerTrade}
                onChange={(e) => setConfig({ ...config, riskPerTrade: parseFloat(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-slate-300">Max Position Size (%)</Label>
              <Input
                type="number"
                value={config.maxPositionSize}
                onChange={(e) => setConfig({ ...config, maxPositionSize: parseFloat(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Max Open Positions</Label>
              <Input
                type="number"
                value={config.maxOpenPositions}
                onChange={(e) => setConfig({ ...config, maxOpenPositions: parseInt(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ML Settings */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Server className="h-5 w-5 text-violet-400" />
            ML & AI Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
            <div>
              <div className="text-sm text-white">ML Regime Classifier</div>
              <div className="text-xs text-slate-400">Random Forest / XGBoost market regime detection</div>
            </div>
            <Switch
              checked={config.useMLRegime}
              onCheckedChange={(v) => setConfig({ ...config, useMLRegime: v })}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
            <div>
              <div className="text-sm text-white">PPO RL Optimizer</div>
              <div className="text-xs text-slate-400">Proximal Policy Optimization for dynamic strategy allocation</div>
            </div>
            <Switch
              checked={config.usePPORL}
              onCheckedChange={(v) => setConfig({ ...config, usePPORL: v })}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
            <div>
              <div className="text-sm text-white">Sentiment Analysis (LLM)</div>
              <div className="text-xs text-slate-400">Parse news and social media for signal enrichment</div>
            </div>
            <Switch
              checked={config.useSentiment}
              onCheckedChange={(v) => setConfig({ ...config, useSentiment: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Infrastructure */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-400" />
            Infrastructure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Cloud</span>
              </div>
              <p className="text-xs text-slate-400">AWS EC2 / DigitalOcean VPS</p>
              <Badge className="mt-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Configured</Badge>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium text-white">Database</span>
              </div>
              <p className="text-xs text-slate-400">PostgreSQL + Redis</p>
              <Badge className="mt-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Connected</Badge>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-red-400" />
                <span className="text-sm font-medium text-white">Monitoring</span>
              </div>
              <p className="text-xs text-slate-400">Grafana + Telegram/Email</p>
              <Badge className="mt-2 bg-amber-500/20 text-amber-400 border-amber-500/30">Setup Required</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button className="bg-emerald-600 hover:bg-emerald-700">Save Configuration</Button>
    </div>
  );
}
