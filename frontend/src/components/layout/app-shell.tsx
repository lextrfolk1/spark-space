import { useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  Cable,
  ChevronLeft,
  ChevronRight,
  Database,
  History,
  LayoutPanelLeft,
  PanelBottom,
  PanelRight,
  Settings,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { useNotebookStore } from "../../store/notebook-store";
import { SidebarLeft } from "./sidebar-left";
import { SidebarRight } from "./sidebar-right";
import { BottomPanel } from "./bottom-panel";

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
  const { panels, togglePanel, theme } = useNotebookStore();
  const isWorkspace = location.pathname === "/workspace" || location.pathname === "/";

  useEffect(() => {
    // Remove previous theme- classes
    const classes = Array.from(document.documentElement.classList);
    classes.forEach((c) => {
      if (c.startsWith("theme-")) {
        document.documentElement.classList.remove(c);
      }
    });
    document.documentElement.classList.add(`theme-${theme}`);
    if (theme === "light-clean") {
      document.documentElement.style.colorScheme = "light";
    } else {
      document.documentElement.style.colorScheme = "dark";
    }
  }, [theme]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-canvas text-ink">
      {/* Radial gradient background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(242,201,109,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(96,165,250,0.05),_transparent_20%)]" />

      {/* Top toolbar */}
      <header className="relative z-20 flex items-center h-10 px-2 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-lg shrink-0">
        {/* Left: panel toggle + nav */}
        <div className="flex items-center gap-1">
          <button
            className={clsx(
              "p-1.5 rounded-md transition-colors",
              panels.leftSidebar ? "text-accent bg-accent/10" : "text-muted/40 hover:text-muted hover:bg-white/[0.04]"
            )}
            onClick={() => togglePanel("leftSidebar")}
            title="Toggle sidebar"
          >
            <LayoutPanelLeft size={14} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Right: panel toggles */}
        {isWorkspace && (
          <div className="flex items-center gap-1">
            <button
              className={clsx(
                "p-1.5 rounded-md transition-colors",
                panels.bottomPanel ? "text-accent bg-accent/10" : "text-muted/40 hover:text-muted hover:bg-white/[0.04]"
              )}
              onClick={() => togglePanel("bottomPanel")}
              title="Toggle bottom panel"
            >
              <PanelBottom size={14} />
            </button>
            <button
              className={clsx(
                "p-1.5 rounded-md transition-colors",
                panels.rightSidebar ? "text-accent bg-accent/10" : "text-muted/40 hover:text-muted hover:bg-white/[0.04]"
              )}
              onClick={() => togglePanel("rightSidebar")}
              title="Toggle inspector"
            >
              <PanelRight size={14} />
            </button>
          </div>
        )}
      </header>

      {/* Main content area */}
      <div className="relative flex flex-1 min-h-0">
        {/* Left Sidebar */}
        {panels.leftSidebar && (
          <aside
            className="relative z-10 w-56 border-r border-white/[0.06] bg-slate-950/60 backdrop-blur-sm shrink-0 flex flex-col"
            style={{ minWidth: 224 }}
          >
            <SidebarLeft />
          </aside>
        )}

        {/* Center + Bottom stack */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Center panel */}
          <main className="flex-1 min-h-0 overflow-auto p-3">
            <Outlet />
          </main>

          {/* Bottom panel */}
          {isWorkspace && panels.bottomPanel && (
            <div
              className="border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-sm shrink-0"
              style={{ height: 220 }}
            >
              <BottomPanel />
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        {isWorkspace && panels.rightSidebar && (
          <aside
            className="relative z-10 w-64 border-l border-white/[0.06] bg-slate-950/60 backdrop-blur-sm shrink-0 flex flex-col"
            style={{ minWidth: 256 }}
          >
            <SidebarRight />
          </aside>
        )}
      </div>
    </div>
  );
}
