import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Activity,
  Brain,
  TrendingUp,
  Shield,
  BarChart3,
  Settings,
  Zap,
  Menu,
  X,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/strategies", label: "Strategy Stack", icon: Brain },
  { path: "/backtest", label: "Backtest Lab", icon: BarChart3 },
  { path: "/risk", label: "Risk Center", icon: Shield },
  { path: "/analytics", label: "Analytics", icon: TrendingUp },
  { path: "/terminal", label: "Terminal", icon: Zap },
];

function Sidebar({ isCollapsed }: { isCollapsed: boolean }) {
  const location = useLocation();

  return (
    <div className={`bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ${isCollapsed ? "w-16" : "w-64"}`}>
      <div className="h-16 flex items-center justify-center border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-emerald-400" />
          {!isCollapsed && <span className="font-bold text-white text-lg tracking-tight">AlphaBot</span>}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <Link
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
        >
          <Settings className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Settings</span>}
        </Link>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar isCollapsed={isCollapsed} />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild className="lg:hidden absolute top-4 left-4 z-50">
          <Button variant="ghost" size="icon" className="text-white">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 bg-slate-900 border-slate-800 w-64">
          <Sidebar isCollapsed={false} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex text-slate-400 hover:text-white"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2 text-emerald-400">
              <Activity className="h-4 w-4 animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-wider">System Online</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-slate-300">Paper Trading</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
