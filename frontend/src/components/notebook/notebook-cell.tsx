import { startTransition, useMemo, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "../../lib/api";
import { Dataset, Datasource, ExecutionResult, NotebookCell } from "../../types/domain";
import { Button, Card, Select } from "../shared/ui";
import { exportToCSV, exportToExcel, exportToPDF } from "../../lib/exports";

type NotebookCellProps = {
  cell: NotebookCell;
  datasets: Dataset[];
  datasources: Datasource[];
  onChange: (patch: Partial<NotebookCell>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: "up" | "down") => void;
};

const engineMeta: Record<
  NotebookCell["engine"],
  {
    label: string;
    language: "sql" | "python";
    hint: string;
    datasetLabel: string;
    accentClass: string;
  }
> = {
  spark_sql: {
    label: "Spark SQL",
    language: "sql",
    hint: "Use SQL against the selected dataset or connection.",
    datasetLabel: "Primary dataset",
    accentClass: "bg-emerald-500/20 text-emerald-300",
  },
  spark_dataframe: {
    label: "Spark DataFrame",
    language: "python",
    hint: "Write DataFrame-style Python against the selected dataset context.",
    datasetLabel: "Input dataset",
    accentClass: "bg-sky-500/20 text-sky-300",
  },
  rule_engine: {
    label: "Rule Engine",
    language: "python",
    hint: "Placeholder engine path for future rule execution planning.",
    datasetLabel: "Rule input",
    accentClass: "bg-amber-500/20 text-amber-300",
  },
};

export function NotebookCellView({
  cell,
  datasets,
  datasources,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
}: NotebookCellProps) {
  const meta = engineMeta[cell.engine] ?? engineMeta.spark_sql;
  const [editorRef, setEditorRef] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const run = async () => {
    onChange({ status: "running" });

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
      const result = await api.execute({
        engine: cell.engine,
        datasource_id: cell.datasourceId,
        dataset_ids: cell.datasourceId ? [] : cell.datasetIds,
        command: commandToRun,
        execution_mode: mode,
        context: { cellId: cell.id },
      });
      onChange({
        status: result.status === "completed" ? "completed" : "failed",
        durationMs: result.execution_time_ms,
        result,
        datasetIds: result.dataset_ids || [],
      });
    } catch (error) {
      onChange({
        status: "failed",
        result: {
          execution_id: crypto.randomUUID(),
          status: "failed",
          schema: [],
          rows: [],
          row_count: 0,
          dataframe_metadata: {},
          logs: [String(error)],
          warnings: [],
          error: String(error),
          execution_time_ms: 0,
          statistics: {},
        },
      });
    }
  };

  const runRef = useRef(run);
  runRef.current = run;

  return (
    <div className={clsx(
      "relative overflow-hidden rounded-lg border bg-slate-950/40 p-2.5 shadow-sm transition-all duration-200 pl-5 border-white/5",
      cell.status === "running" && "ring-1 ring-accent/30",
      cell.status === "failed" && "border-rose-500/20",
      cell.status === "completed" && "border-emerald-500/20"
    )}>
      {/* Left Accent Bar indicating engine type */}
      <div className={clsx(
        "absolute left-0 top-0 bottom-0 w-[4px]",
        cell.engine === "spark_sql" && "bg-emerald-500",
        cell.engine === "spark_dataframe" && "bg-sky-500",
        cell.engine === "rule_engine" && "bg-amber-500"
      )} />

      {/* Top Header Controls: Title, Engine, Datasource, Run Button, Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted font-bold select-none">
            [{cell.status === "running" ? "*" : cell.status === "completed" ? "✓" : " "}] {cell.title}
          </span>
          
          {/* Engine Select Wrapper */}
          <div className="relative inline-flex items-center">
            <select
              className="h-7 pl-2 pr-7 text-xs rounded bg-slate-950 border border-white/10 text-ink outline-none appearance-none cursor-pointer w-auto min-w-[70px]"
              value={cell.engine}
              onChange={(event) => onChange({ engine: event.target.value as NotebookCell["engine"] })}
            >
              <option value="spark_sql" className="bg-slate-950 text-ink">SQL</option>
              <option value="spark_dataframe" className="bg-slate-950 text-ink">DataFrame</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 pointer-events-none text-muted" />
          </div>

          {/* Connection Select Wrapper */}
          <div className="relative inline-flex items-center">
            <select
              className="h-7 pl-2 pr-7 text-xs rounded bg-slate-950 border border-white/10 text-ink outline-none appearance-none cursor-pointer max-w-[200px] w-auto truncate"
              value={cell.datasourceId ?? ""}
              onChange={(event) => onChange({ datasourceId: event.target.value || undefined })}
            >
              <option value="" className="bg-slate-950 text-ink">Select connection</option>
              {datasources.map((item) => (
                <option key={item.id} value={item.id} className="bg-slate-950 text-ink">
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 pointer-events-none text-muted" />
          </div>

          {cell.status !== "idle" && (
            <span className={clsx(
              "rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider",
              cell.status === "completed" && "bg-emerald-500/10 text-emerald-400",
              cell.status === "running" && "bg-accent/10 text-accent animate-pulse",
              cell.status === "failed" && "bg-rose-500/10 text-rose-400",
            )}>
              {cell.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 relative">
          <Button
            className="h-7 px-3 py-0 text-xs rounded-md gap-1.5 bg-accent hover:brightness-110 text-slate-950 font-bold"
            onClick={run}
            disabled={cell.status === "running"}
          >
            <Play size={10} fill="currentColor" />
            Run
          </Button>

          <button
            className="h-7 px-2 text-[11px] rounded-md border border-white/10 bg-slate-900 hover:bg-slate-800 text-muted hover:text-ink flex items-center gap-1 transition"
            onClick={() => onChange({ result: undefined, status: "idle" })}
            title="Clear Outputs"
          >
            <RotateCcw size={12} />
            <span>Clear</span>
          </button>

          {/* Actions Dropdown */}
          <div className="relative">
            <button
              className={clsx(
                "h-7 px-2 text-[11px] rounded-md border border-white/10 flex items-center gap-1 transition",
                menuOpen ? "bg-slate-800 text-ink" : "bg-slate-900 text-muted hover:bg-slate-800 hover:text-ink"
              )}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span>Actions</span>
              <ChevronDown size={10} className={clsx("transition-transform", menuOpen && "rotate-180")} />
            </button>
            
            {menuOpen && (
              <>
                {/* Backdrop overlay for click outside closing */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                
                {/* Dropdown popup */}
                <div className="absolute right-0 mt-1 w-32 rounded border border-white/10 bg-slate-950 p-1 shadow-lg z-50">
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1 text-[11px] text-muted hover:bg-white/5 hover:text-ink transition text-left"
                    onClick={() => {
                      onMove("up");
                      setMenuOpen(false);
                    }}
                  >
                    <ChevronUp size={12} />
                    <span>Move Up</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1 text-[11px] text-muted hover:bg-white/5 hover:text-ink transition text-left"
                    onClick={() => {
                      onMove("down");
                      setMenuOpen(false);
                    }}
                  >
                    <ChevronDown size={12} />
                    <span>Move Down</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1 text-[11px] text-muted hover:bg-white/5 hover:text-ink transition text-left"
                    onClick={() => {
                      onDuplicate();
                      setMenuOpen(false);
                    }}
                  >
                    <Copy size={12} />
                    <span>Duplicate</span>
                  </button>
                  <div className="my-1 border-t border-white/5" />
                  <button
                    className="w-full flex items-center gap-2 rounded px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition text-left"
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Delete Cell</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Editor Container */}
      {!cell.collapsed && (
        <div className="border border-white/5 rounded-md overflow-hidden bg-slate-950">
          <Editor
            height="140px"
            language={meta.language}
            theme="vs-dark"
            value={cell.content}
            options={{
              minimap: { enabled: false },
              fontSize: 12.5,
              lineNumbers: "on",
              wordWrap: "on",
              roundedSelection: false,
              scrollBeyondLastLine: false,
              scrollbar: { vertical: "visible", horizontal: "auto" }
            }}
            onMount={(editor, monaco) => {
              setEditorRef(editor);
              editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
                runRef.current();
              });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                runRef.current();
              });
              editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter, () => {
                runRef.current();
              });
            }}
            onChange={(value) => onChange({ content: value ?? "" })}
          />
        </div>
      )}

      {/* Output Panel (Extensible / Scalable Rendering) */}
      {!cell.collapsed && cell.result && (
        <div className="mt-3.5 border-t border-white/5 pt-3 space-y-3">
          {/* Error Message */}
          {cell.result.error && (
            <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs font-mono text-rose-400 whitespace-pre-wrap">
              {cell.result.error}
            </div>
          )}

          {/* Export Header & Table Results */}
          {cell.result.rows && cell.result.rows.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Result Set ({cell.result.rows.length} rows)
                </span>
                <div className="flex items-center gap-1.5 bg-slate-900/40 px-2 py-0.5 rounded border border-white/5">
                  <span className="text-[10px] text-muted/60">Export:</span>
                  <button
                    onClick={() => exportToCSV(cell.result!.rows, cell.title)}
                    className="hover:text-accent text-[10px] font-medium text-muted transition"
                  >
                    CSV
                  </button>
                  <span className="text-white/10">|</span>
                  <button
                    onClick={() => exportToExcel(cell.result!.rows, cell.title)}
                    className="hover:text-accent text-[10px] font-medium text-muted transition"
                  >
                    Excel
                  </button>
                  <span className="text-white/10">|</span>
                  <button
                    onClick={() => exportToPDF(cell.result!.rows, cell.title)}
                    className="hover:text-accent text-[10px] font-medium text-muted transition"
                  >
                    PDF
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-white/5 bg-slate-950/40 max-h-60">
                <table className="min-w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 border-b border-white/5 text-muted select-none">
                    <tr>
                      {Object.keys(cell.result.rows[0] ?? {}).map((key) => (
                        <th key={key} className="px-3 py-1.5 font-bold border-r border-white/5">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cell.result.rows.map((row, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key} className="px-3 py-1 border-r border-white/5 max-w-xs truncate text-muted" title={String(value)}>
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Logs & Warnings Console */}
          {(cell.result.logs.length > 0 || cell.result.warnings.length > 0) && (
            <details className="group" open={!cell.result.rows || cell.result.rows.length === 0}>
              <summary className="list-none flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-ink select-none font-bold font-mono">
                <span>Execution Console</span>
                <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded">
                  {cell.result.logs.length + cell.result.warnings.length} entries
                </span>
                <ChevronDown size={12} className="transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-1 bg-slate-950/50 p-2.5 rounded border border-white/5 font-mono text-[11px] text-muted max-h-40 overflow-y-auto font-mono">
                {cell.result.warnings.map((line, idx) => (
                  <div key={`warn-${idx}`} className="text-amber-400">
                    [WARNING] {line}
                  </div>
                ))}
                {cell.result.logs.map((line, idx) => (
                  <div key={`log-${idx}`}>
                    {line}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Run Time Statistics */}
          <div className="flex items-center justify-between text-[10px] text-muted border-t border-white/5 pt-1.5 select-none">
            <span>Duration: {cell.durationMs || cell.result.execution_time_ms || 0} ms</span>
            {cell.result.statistics && cell.result.statistics.returnedRows !== undefined && (
              <span>Rows: {String(cell.result.statistics.returnedRows)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
