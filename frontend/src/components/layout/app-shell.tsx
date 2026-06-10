import {
  Activity,
  Cable,
  Database,
  History,
  PanelLeftClose,
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
    <div className="min-h-screen bg-canvas px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_28%)]" />
      <div className="relative grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-bold">Execution Workspace</p>
                <p className="mt-1 text-sm text-muted">Notebook orchestration for Spark-ready execution engines.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-accent">
                <PanelLeftClose size={18} />
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/25 p-3">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-muted">
                <Search size={16} />
                <span className="text-sm">Search everywhere</span>
                <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-xs">/</span>
              </div>
            </div>
            <nav className="mt-5 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
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
          <Card className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Current Route</p>
            <p className="mt-3 font-display text-xl">{location.pathname.replace("/", "") || "workspace"}</p>
            <p className="mt-2 text-sm text-muted">Generic editor surface, pluggable engine pipeline, dataset-first operations.</p>
          </Card>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

