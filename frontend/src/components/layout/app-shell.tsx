import {
  Activity,
  Cable,
  Database,
  History,
  LayoutPanelLeft,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Card } from "../shared/ui";

const navItems = [
  { to: "/workspace", label: "Workspace", icon: Sparkles },
  { to: "/datasets", label: "Datasets", icon: Database },
  { to: "/connections", label: "Connections", icon: Cable },
  { to: "/history", label: "History", icon: History },
  { to: "/logs", label: "Logs", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-canvas px-3 py-3 text-ink sm:px-4 lg:px-5">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.08),_transparent_24%)]" />
      <div className="relative grid min-h-[calc(100vh-1.5rem)] gap-3 lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Card className="overflow-hidden p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-base font-bold">Execution Workspace</p>
                <p className="mt-1 text-xs text-muted">Focused notebook UI for Spark execution workflows.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-accent">
                <LayoutPanelLeft size={16} />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/20 p-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-muted">
                <Search size={16} />
                <span className="text-xs">Search views</span>
                <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px]">/</span>
              </div>
            </div>
            <nav className="mt-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                        isActive ? "bg-accent text-slate-950" : "text-muted hover:bg-white/5 hover:text-ink",
                      ].join(" ")
                    }
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted">Current Route</p>
            <p className="mt-2 font-display text-lg">{location.pathname.replace("/", "") || "workspace"}</p>
            <p className="mt-2 text-xs text-muted">Compact, execution-first workspace with pluggable engines.</p>
          </Card>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
