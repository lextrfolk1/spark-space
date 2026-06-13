import { useState, useRef, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Play,
  RotateCcw,
  Trash2,
  Loader2,
  ArrowUpDown,
  Type,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "../../lib/api";
import { useNotebookStore } from "../../store/notebook-store";
import type { CellType, Datasource, Dataset, NotebookCell } from "../../types/domain";
import { SqlCellEditor } from "./cell-types/SqlCellEditor";
import { MarkdownCellEditor } from "./cell-types/MarkdownCellEditor";
import { ResultRenderer } from "../renderers";
import { LogRenderer } from "../renderers/LogRenderer";
import { exportToCSV, exportToExcel, exportToPDF } from "../../lib/exports";

type Props = {
  cell: NotebookCell;
  datasets: Dataset[];
  datasources: Datasource[];
  onChange: (patch: Partial<NotebookCell>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: "up" | "down") => void;
};

const CELL_TYPE_META: Record<string, {
  label: string;
  accent: string;
  accentBorder: string;
  language: string;
}> = {
  SQL: { label: "SQL", accent: "bg-emerald-500", accentBorder: "border-emerald-500/30", language: "sql" },
  MARKDOWN: { label: "Markdown", accent: "bg-violet-500", accentBorder: "border-violet-500/30", language: "markdown" },
  RESULT: { label: "Result", accent: "bg-amber-500", accentBorder: "border-amber-500/30", language: "sql" },
  NATURAL_LANGUAGE: { label: "NL Query", accent: "bg-pink-500", accentBorder: "border-pink-500/30", language: "plaintext" },
  SPARK_SQL: { label: "Spark SQL", accent: "bg-emerald-500", accentBorder: "border-emerald-500/30", language: "sql" },
  PYTHON_DATAFRAME: { label: "DataFrame", accent: "bg-sky-500", accentBorder: "border-sky-500/30", language: "python" },
};

const AVAILABLE_CELL_TYPES: CellType[] = ["SQL", "NATURAL_LANGUAGE", "SPARK_SQL", "PYTHON_DATAFRAME"];

const STATUS_DOTS: Record<string, string> = {
  idle: "bg-white/20",
  running: "bg-accent animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-rose-400",
};

export function NotebookCellView({ cell, datasets, datasources, onChange, onDelete, onDuplicate, onMove }: Props) {
  const meta = CELL_TYPE_META[cell.cell_type] ?? CELL_TYPE_META.SQL;
  const [editorRef, setEditorRef] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultTab, setResultTab] = useState<"table" | "schema" | "logs">("table");
  const { selectCell, activeCellId, addExecutionResult, activeNotebook } = useNotebookStore();
  const isActive = activeCellId === cell.id;

  const result = cell.result || cell.last_result;
  const hasResult = cell.cell_type !== "MARKDOWN" && !!(result && (result.rows?.length > 0 || result.error));

  const run = async () => {
    onChange({ status: "running" });
    selectCell(cell.id);

    let commandToRun = cell.content;
    let mode: "current_cell" | "selected_text" = "current_cell";

    if (editorRef) {
      const selection = editorRef.getSelection();
      const model = editorRef.getModel();
      if (selection && model) {
        const selectedText = model.getValueInRange(selection);
        if (selectedText && selectedText.trim().length > 0) {
          commandToRun = selectedText;
          mode = "selected_text";
        }
      }
    }

    try {
      const notebookId = activeNotebook?.id || "default";
      const executeResponse = await api.executeCell(notebookId, cell.id, {
        cellType: cell.cell_type,
        inputType: cell.input_type || "STRUCTURED_QUERY",
        content: commandToRun,
        context: {
          engine: cell.engine || "spark_sql",
          connectionId: cell.datasourceId,
          dataset: cell.datasourceId ? undefined : cell.datasetIds?.[0],
          cellId: cell.id,
          executionMode: mode,
          ...cell.metadata,
        },
      });
      onChange({
        status: executeResponse.status === "SUCCESS" ? "completed" : "failed",
        durationMs: (executeResponse.metadata?.executionTimeMs as number) || 0,
        last_result: executeResponse,
        datasetIds: cell.datasetIds,
        metadata: cell.metadata,
      });
      addExecutionResult(executeResponse);
    } catch (error) {
      onChange({
        status: "failed",
        last_result: {
          execution_id: crypto.randomUUID(),
          status: "FAILED",
          execution_type: cell.cell_type,
          result_type: "ERROR",
          columns: [],
          schema: [],
          rows: [],
          row_count: 0,
          metadata: { executionTimeMs: 0 },
          logs: [String(error)],
          warnings: [],
          error: String(error),
        },
      });
    }
  };

  const runRef = useRef(run);
  runRef.current = run;

  return (
    <div
      className={clsx(
        "relative rounded-xl border bg-slate-950/30 shadow-sm transition-all duration-200 overflow-hidden group",
        isActive ? "border-accent/20 ring-1 ring-accent/10" : "border-white/[0.05]",
        cell.status === "running" && "ring-1 ring-accent/20",
        cell.status === "failed" && "border-rose-500/20"
      )}
      onClick={() => selectCell(cell.id)}
    >
      {/* Left accent bar */}
      <div className={clsx("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", meta.accent)} />

      {/* Header */}
      <div className="flex items-center gap-2 pl-4 pr-2 py-1.5 border-b border-white/[0.04]">
        {/* Status dot */}
        {cell.cell_type !== "MARKDOWN" && (
          <div className={clsx("w-2 h-2 rounded-full shrink-0 transition-colors", STATUS_DOTS[cell.status])} />
        )}

        {/* Cell title */}
        <span className="text-[11px] font-mono text-muted/60 font-medium shrink-0">
          {cell.title}
        </span>

        {/* Cell type selector */}
        <div className="relative inline-flex">
          <select
            className="h-6 pl-1.5 pr-5 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.06] text-ink outline-none appearance-none cursor-pointer font-medium"
            value={cell.cell_type}
            onChange={(e) => onChange({ cell_type: e.target.value as CellType })}
          >
            {AVAILABLE_CELL_TYPES.map((ct) => (
              <option key={ct} value={ct} className="bg-slate-950 text-ink">
                {CELL_TYPE_META[ct]?.label ?? ct}
              </option>
            ))}
          </select>
          <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted/30" />
        </div>

        {/* Connection selector (SQL, Spark SQL and DataFrame cells) */}
        {(cell.cell_type === "SQL" || cell.cell_type === "SPARK_SQL" || cell.cell_type === "PYTHON_DATAFRAME") && (
          <div className="relative inline-flex">
            <select
              className="h-6 pl-1.5 pr-5 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.06] text-ink outline-none appearance-none cursor-pointer max-w-[140px] truncate"
              value={cell.datasourceId ?? ""}
              onChange={(e) => onChange({ datasourceId: e.target.value || undefined })}
            >
              <option value="" className="bg-slate-950">No connection</option>
              {datasources.map((ds) => (
                <option key={ds.id} value={ds.id} className="bg-slate-950">{ds.name}</option>
              ))}
            </select>
            <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted/30" />
          </div>
        )}

        {/* Status badge */}
        {cell.cell_type !== "MARKDOWN" && cell.status !== "idle" && (
          <span className={clsx(
            "text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider",
            cell.status === "completed" && "bg-emerald-500/10 text-emerald-400",
            cell.status === "running" && "bg-accent/10 text-accent",
            cell.status === "failed" && "bg-rose-500/10 text-rose-400",
          )}>
            {cell.status}
          </span>
        )}

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          {cell.cell_type !== "MARKDOWN" && (
            <button
              className={clsx(
                "h-6 px-2.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors",
                cell.status === "running"
                  ? "bg-accent/20 text-accent cursor-wait"
                  : "bg-accent text-slate-950 hover:brightness-110"
              )}
              onClick={(e) => { e.stopPropagation(); run(); }}
              disabled={cell.status === "running"}
            >
              {cell.status === "running" ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Play size={9} fill="currentColor" />
              )}
              Run
            </button>
          )}

          <button
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted/40 hover:text-muted hover:bg-white/[0.04] transition-colors"
            onClick={(e) => { e.stopPropagation(); onChange({ result: undefined, status: "idle" }); }}
            title="Clear"
          >
            <RotateCcw size={11} />
          </button>

          {/* Actions menu */}
          <div className="relative">
            <button
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted/40 hover:text-muted hover:bg-white/[0.04] transition-colors"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            >
              <ArrowUpDown size={11} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 w-32 rounded-lg border border-white/[0.08] bg-slate-950 p-1 shadow-xl z-50">
                  <MenuItem icon={ChevronUp} label="Move Up" onClick={() => { onMove("up"); setMenuOpen(false); }} />
                  <MenuItem icon={ChevronDown} label="Move Down" onClick={() => { onMove("down"); setMenuOpen(false); }} />
                  <MenuItem icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); setMenuOpen(false); }} />
                  <div className="my-1 border-t border-white/[0.06]" />
                  <MenuItem icon={Trash2} label="Delete" danger onClick={() => { onDelete(); setMenuOpen(false); }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Editor area (per cell type) */}
      {!cell.collapsed && (
        <div className="pl-4 pr-2 py-2">
          {(cell.cell_type === "SQL" || cell.cell_type === "SPARK_SQL" || cell.cell_type === "NATURAL_LANGUAGE") && (
            <SqlCellEditor
              content={cell.content}
              language={meta.language}
              onChange={(v) => onChange({ content: v })}
              onRun={run}
              onEditorMount={setEditorRef}
            />
          )}
          {cell.cell_type === "PYTHON_DATAFRAME" && (
            <SqlCellEditor
              content={cell.content}
              language="python"
              onChange={(v) => onChange({ content: v })}
              onRun={run}
              onEditorMount={setEditorRef}
            />
          )}
          {cell.cell_type === "MARKDOWN" && (
            <MarkdownCellEditor
              content={cell.content}
              onChange={(v) => onChange({ content: v })}
            />
          )}
        </div>
      )}

      {/* Result area */}
      {!cell.collapsed && hasResult && (
        <div className="border-t border-white/[0.04] pl-4 pr-2 py-2 space-y-2">
          {/* Result tabs */}
          <div className="flex items-center gap-0.5">
            {(["table", "logs"] as const).map((tab) => (
              <button
                key={tab}
                className={clsx(
                  "px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors capitalize",
                  resultTab === tab
                    ? "bg-white/[0.06] text-ink"
                    : "text-muted/40 hover:text-muted hover:bg-white/[0.03]"
                )}
                onClick={() => setResultTab(tab)}
              >
                {tab}
              </button>
            ))}

            <div className="flex-1" />

            {/* Export buttons */}
            {result?.rows && result.rows.length > 0 && (
              <div className="flex items-center gap-1 text-[9px]">
                <span className="text-muted/20">Export:</span>
                <button onClick={() => exportToCSV(result.rows, cell.title)} className="text-muted/40 hover:text-accent transition">CSV</button>
                <span className="text-white/[0.06]">·</span>
                <button onClick={() => exportToExcel(result.rows, cell.title)} className="text-muted/40 hover:text-accent transition">Excel</button>
                <span className="text-white/[0.06]">·</span>
                <button onClick={() => exportToPDF(result.rows, cell.title)} className="text-muted/40 hover:text-accent transition">PDF</button>
              </div>
            )}

            {/* Row count */}
            <span className="text-[9px] text-muted/30 ml-2">
              {result?.rows?.length ?? 0} rows · {cell.durationMs || (result as any).execution_time_ms || (result as any)?.metadata?.executionTimeMs || 0}ms
            </span>
          </div>

          {/* Tab content */}
          {resultTab === "table" && (
            <div>
              {result?.error && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-2.5 text-xs font-mono text-rose-400 whitespace-pre-wrap mb-2">
                  {typeof result.error === "object" && result.error !== null ? (
                    <div className="space-y-1">
                      <div className="font-semibold text-rose-300">{result.error.message || "An error occurred."}</div>
                      {result.error.details && <div className="text-[11px] text-rose-400/80 mt-1">{result.error.details}</div>}
                      {result.error.hint && <div className="text-[11px] text-rose-400/60 italic mt-1">Hint: {result.error.hint}</div>}
                    </div>
                  ) : (
                    String(result.error)
                  )}
                </div>
              )}
              {result?.rows && result.rows.length > 0 && (
                <ResultRenderer result={result} />
              )}
            </div>
          )}

          {resultTab === "logs" && result && (
            <LogRenderer result={result as any} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function MenuItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ComponentType<any>;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "w-full flex items-center gap-2 rounded-md px-2 py-1 text-[11px] transition text-left",
        danger
          ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
          : "text-muted hover:bg-white/[0.04] hover:text-ink"
      )}
      onClick={onClick}
    >
      <Icon size={12} />
      <span>{label}</span>
    </button>
  );
}
