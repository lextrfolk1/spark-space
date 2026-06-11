import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Play, Trash2, Search, FileCode, Database, ChevronDown, Sparkles, Terminal, Bot } from "lucide-react";
import { clsx } from "clsx";
import { api } from "../../lib/api";
import { useNotebookStore } from "../../store/notebook-store";
import { NotebookCellView } from "./notebook-cell";
import type { CellType } from "../../types/domain";

export function NotebookWorkspace() {
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });

  const {
    cells,
    addCell,
    updateCell,
    deleteCell,
    duplicateCell,
    moveCell,
    activeNotebook,
    openTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    searchQuery,
    setSearchQuery,
  } = useNotebookStore();

  // Filter cells by search
  const filteredCells = useMemo(() => {
    if (!searchQuery.trim()) return cells;
    const q = searchQuery.toLowerCase();
    return cells.filter(
      (c) =>
        c.content.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.cell_type.toLowerCase().includes(q)
    );
  }, [cells, searchQuery]);

  if (!activeNotebook) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center space-y-4 w-full h-full min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-accent/5 flex items-center justify-center border border-accent/10 shadow-sm">
          <FileCode size={28} className="text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">No active notebook</h3>
          <p className="text-xs text-muted mt-1 max-w-xs mx-auto leading-relaxed">
            Create a new notebook using the <span className="text-accent font-semibold">+</span> button in the left sidebar, or select an existing notebook to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 w-full">
      {/* Notebook tabs */}
      {openTabs.length > 0 && (
        <div className="flex items-center gap-0.5 px-1 overflow-x-auto scrollbar-none">
          {openTabs.map((tab) => (
            <button
              key={tab.id}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors shrink-0",
                activeTabId === tab.id
                  ? "bg-slate-900/80 text-ink border border-white/[0.06] border-b-0"
                  : "text-muted/40 hover:text-muted hover:bg-white/[0.02]"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <FileCode size={12} />
              <span className="max-w-[120px] truncate">{tab.name}</span>
              <button
                className="ml-1 text-muted/30 hover:text-rose-400 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-1">
        {/* Search */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xs bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 py-1.5 focus-within:border-accent/20 transition-colors">
          <Search size={12} className="text-muted/30 shrink-0" />
          <input
            type="text"
            placeholder="Search cells..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-ink outline-none w-full placeholder:text-muted/20"
          />
        </div>

        <div className="flex-1" />

        {/* Cell counts */}
        <div className="flex items-center gap-2 text-[10px] text-muted/30">
          <span>{cells.length} cells</span>
          <span>·</span>
          <span>{datasets.length} datasets</span>
          <span>·</span>
          <span>{datasources.length} connections</span>
        </div>

        {/* Add cell buttons */}
        <div className="flex items-center gap-1">
          <AddCellButton icon={FileCode} label="SQL" onClick={() => addCell("SQL")} />
          <AddCellButton icon={Sparkles} label="Spark SQL" onClick={() => addCell("SPARK_SQL")} />
          <AddCellButton icon={Terminal} label="DataFrame" onClick={() => addCell("PYTHON_DATAFRAME")} />
          <AddCellButton icon={Bot} label="NL Query" onClick={() => addCell("NATURAL_LANGUAGE")} />
        </div>
      </div>

      {/* Cells */}
      <div className="space-y-2">
        {filteredCells.map((cell, index) => (
          <NotebookCellView
            key={cell.id}
            cell={{ ...cell, title: `Cell ${index + 1}` }}
            datasets={datasets}
            datasources={datasources}
            onChange={(patch) => updateCell(cell.id, patch)}
            onDelete={() => deleteCell(cell.id)}
            onDuplicate={() => duplicateCell(cell.id)}
            onMove={(direction) => moveCell(cell.id, direction)}
          />
        ))}
      </div>

      {/* Empty state / Add cell area */}
      {cells.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center">
            <FileCode size={28} className="text-amber-400/60" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-ink/80">No cells yet</h3>
            <p className="text-xs text-muted/40 mt-1">Add a cell to start writing queries</p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-slate-950 text-sm font-bold hover:brightness-110 transition"
            onClick={() => addCell("SQL")}
          >
            <Plus size={14} />
            Add SQL Cell
          </button>
        </div>
      )}

      {/* Add cell footer */}
      {cells.length > 0 && (
        <div className="flex justify-center py-4">
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-white/[0.08] text-xs text-muted/40 hover:text-muted hover:border-white/[0.15] hover:bg-white/[0.02] transition-colors"
            onClick={() => addCell("SQL")}
          >
            <Plus size={13} />
            Add Cell
          </button>
        </div>
      )}
    </div>
  );
}

function AddCellButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted/40 hover:text-muted hover:bg-white/[0.04] transition-colors border border-white/[0.04] hover:border-white/[0.08]"
      onClick={onClick}
    >
      <Icon size={11} className="text-muted/30" />
      {label}
    </button>
  );
}
