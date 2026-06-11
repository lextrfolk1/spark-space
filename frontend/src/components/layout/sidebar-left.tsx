import { useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Cable,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Activity,
  History,
  Settings,
  Sparkles,
  Edit3,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/api";
import { useNotebookStore } from "../../store/notebook-store";
import type { Dataset, Datasource, NotebookListItem } from "../../types/domain";
import { clsx } from "clsx";

type SidebarSection = "notebooks" | "datasets" | "connections";

const navItems = [
  { to: "/workspace", label: "Workspace", icon: Sparkles },
  { to: "/datasets", label: "Datasets", icon: Database },
  { to: "/connections", label: "Connections", icon: Cable },
  { to: "/history", label: "History", icon: History },
  { to: "/logs", label: "Logs", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function SidebarLeft() {
  const location = useLocation();
  const isWorkspace = location.pathname === "/workspace" || location.pathname === "/";
  
  const [expanded, setExpanded] = useState<Record<SidebarSection, boolean>>({
    notebooks: true,
    datasets: true,
    connections: false,
  });
  const [filterText, setFilterText] = useState("");
  const queryClient = useQueryClient();

  const { data: notebooks = [] } = useQuery({ 
    queryKey: ["notebooks"], 
    queryFn: api.listNotebooks,
    enabled: isWorkspace
  });
  const { data: datasets = [] } = useQuery({ 
    queryKey: ["datasets"], 
    queryFn: api.listDatasets,
    enabled: isWorkspace
  });
  const { data: datasources = [] } = useQuery({ 
    queryKey: ["datasources"], 
    queryFn: api.listDatasources,
    enabled: isWorkspace
  });
  const { openTab, setActiveNotebook, renameNotebook, deleteNotebook } = useNotebookStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  const handleRename = async (notebookId: string, name: string) => {
    if (!name.trim()) {
      setRenamingId(null);
      return;
    }
    await renameNotebook(notebookId, name.trim());
    queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    setRenamingId(null);
  };

  const deleteNotebookMutation = useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    },
  });

  const createNotebookMutation = useMutation({
    mutationFn: () => api.createNotebook({ name: `Notebook ${notebooks.length + 1}` }),
    onSuccess: (nb) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      openTab(nb.id, nb.name);
      setActiveNotebook(nb);
    },
  });

  const toggle = (section: SidebarSection) =>
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  const handleOpenNotebook = async (nb: NotebookListItem) => {
    try {
      const full = await api.getNotebook(nb.id);
      setActiveNotebook(full);
      openTab(nb.id, nb.name);
    } catch {
      openTab(nb.id, nb.name);
    }
  };

  const filtered = <T extends { name: string }>(items: T[]): T[] =>
    filterText ? items.filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase())) : items;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brand Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <BookOpen size={15} className="text-slate-950" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-ink leading-none">SparkSpace</h1>
          <p className="text-[10px] text-muted/60 mt-0.5">Data Workbench</p>
        </div>
      </div>

      {/* Unified Vertical Navigation */}
      <nav className="px-2 py-2 border-b border-white/[0.04] space-y-0.5 shrink-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || (item.to === "/workspace" && location.pathname === "/");
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-accent text-slate-950 font-semibold shadow-md shadow-accent/10"
                  : "text-muted/60 hover:bg-white/[0.03] hover:text-ink"
              )}
            >
              <Icon size={13} className={isActive ? "text-slate-950" : "text-muted/40"} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Workspace-specific Lists */}
      {isWorkspace && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search bar inside lists */}
          <div className="px-3 py-2 shrink-0">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 focus-within:border-accent/30 transition-colors">
              <Search size={12} className="text-muted/40 shrink-0" />
              <input
                type="text"
                placeholder="Filter catalog..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="bg-transparent text-[11px] text-ink outline-none w-full placeholder:text-muted/30"
              />
            </div>
          </div>

          {/* Scrollable list items */}
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1.5 scrollbar-thin">
            {/* Notebooks Section */}
            <SidebarGroup
              icon={FileText}
              title="Notebooks"
              count={notebooks.length}
              expanded={expanded.notebooks}
              onToggle={() => toggle("notebooks")}
              onAdd={() => createNotebookMutation.mutate()}
            >
              {filtered(notebooks).map((nb) => (
                <div key={nb.id} className="relative group/nb-item flex items-center w-full">
                  {renamingId === nb.id ? (
                    <input
                      type="text"
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          await handleRename(nb.id, renamingName);
                        } else if (e.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                      onBlur={async () => {
                        await handleRename(nb.id, renamingName);
                      }}
                      autoFocus
                      className="bg-slate-900 border border-accent/20 rounded px-1.5 py-0.5 text-xs text-ink w-full outline-none ml-5 mr-2"
                    />
                  ) : (
                    <>
                      <button
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.04] hover:text-ink transition-colors text-left group pr-14"
                        onClick={() => handleOpenNotebook(nb)}
                      >
                        <FolderOpen size={13} className="text-amber-400/60 shrink-0" />
                        <span className="truncate flex-1">{nb.name}</span>
                        <span className="text-[9px] text-muted/30 shrink-0 group-hover:hidden">{nb.cell_count}c</span>
                      </button>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/nb-item:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(nb.id);
                            setRenamingName(nb.name);
                          }}
                          className="p-1 rounded hover:bg-white/[0.08] text-muted/40 hover:text-accent transition-colors"
                          title="Rename notebook"
                        >
                          <Edit3 size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Are you sure you want to delete "${nb.name}"?`)) {
                              deleteNotebookMutation.mutate(nb.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-white/[0.08] text-muted/40 hover:text-rose-400 transition-colors"
                          title="Delete notebook"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {notebooks.length === 0 && (
                <p className="text-[10px] text-muted/30 px-2.5 py-2">No notebooks yet</p>
              )}
            </SidebarGroup>

            {/* Datasets Section */}
            <SidebarGroup
              icon={Database}
              title="Datasets"
              count={datasets.length}
              expanded={expanded.datasets}
              onToggle={() => toggle("datasets")}
            >
              {filtered(datasets).map((ds: Dataset) => (
                <div
                  key={ds.id}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.04] hover:text-ink transition-colors group"
                >
                  <Database size={12} className="text-emerald-400/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{ds.name}</span>
                    <span className="text-[9px] text-muted/30">{ds.source_type} · {ds.row_count} rows</span>
                  </div>
                </div>
              ))}
              {datasets.length === 0 && (
                <p className="text-[10px] text-muted/30 px-2.5 py-2">No datasets registered</p>
              )}
            </SidebarGroup>

            {/* Connections Section */}
            <SidebarGroup
              icon={Cable}
              title="Connections"
              count={datasources.length}
              expanded={expanded.connections}
              onToggle={() => toggle("connections")}
            >
              {filtered(datasources).map((ds: Datasource) => (
                <div
                  key={ds.id}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.04] hover:text-ink transition-colors"
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ds.runtime_managed ? "bg-emerald-400" : "bg-sky-400"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{ds.name}</span>
                    <span className="text-[9px] text-muted/30">{ds.type} · {ds.host}</span>
                  </div>
                </div>
              ))}
              {datasources.length === 0 && (
                <p className="text-[10px] text-muted/30 px-2.5 py-2">No connections configured</p>
              )}
            </SidebarGroup>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarGroup({
  icon: Icon,
  title,
  count,
  expanded,
  onToggle,
  onAdd,
  children,
}: {
  icon: React.ComponentType<any>;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-bold text-muted/70 hover:bg-white/[0.03] hover:text-ink transition-colors uppercase tracking-wider"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Icon size={12} className="text-muted/40" />
        <span className="flex-1 text-left">{title}</span>
        <span className="text-[9px] text-muted/30 font-normal">{count}</span>
        {onAdd && (
          <button
            className="p-0.5 rounded hover:bg-white/[0.06] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
          >
            <Plus size={11} className="text-muted/40 hover:text-accent" />
          </button>
        )}
      </button>
      {expanded && <div className="ml-1 space-y-0.5">{children}</div>}
    </div>
  );
}
