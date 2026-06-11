import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, PanelRightClose, PanelRightOpen, Plus, GitCompare } from "lucide-react";
import { api } from "../../lib/api";
import { useWorkspaceStore } from "../../store/workspace-store";
import { Button, Card, Select } from "../shared/ui";
import { NotebookCellView } from "./notebook-cell";
import { compareQueryResults } from "../../lib/comparison";

export function NotebookWorkspace() {
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });
  const { cells, addCell, updateCell, deleteCell, duplicateCell, moveCell } = useWorkspaceStore();
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Comparison State
  const [cellIdA, setCellIdA] = useState<string>("");
  const [cellIdB, setCellIdB] = useState<string>("");
  const [matchKey, setMatchKey] = useState<string>("");
  const [showIdentical, setShowIdentical] = useState<boolean>(false);

  // Get active cells that have completed executions with rows
  const completedCells = useMemo(() => {
    return cells.filter(
      (c) =>
        c.result &&
        c.status === "completed" &&
        c.result.rows &&
        c.result.rows.length > 0
    );
  }, [cells]);

  const cellA = useMemo(() => cells.find((c) => c.id === cellIdA), [cells, cellIdA]);
  const cellB = useMemo(() => cells.find((c) => c.id === cellIdB), [cells, cellIdB]);

  const rowsA = useMemo(() => cellA?.result?.rows || [], [cellA]);
  const rowsB = useMemo(() => cellB?.result?.rows || [], [cellB]);

  const colsA = useMemo(() => (rowsA.length > 0 ? Object.keys(rowsA[0]) : []), [rowsA]);
  const colsB = useMemo(() => (rowsB.length > 0 ? Object.keys(rowsB[0]) : []), [rowsB]);

  const commonCols = useMemo(() => {
    return colsA.filter((c) => colsB.includes(c));
  }, [colsA, colsB]);

  // Compute Diff
  const comparison = useMemo(() => {
    return compareQueryResults(cellA, cellB, matchKey);
  }, [cellA, cellB, matchKey]);

  // Filter diff rows based on toggle
  const displayedDiffRows = useMemo(() => {
    if (!comparison) return [];
    if (showIdentical) return comparison.diffRows;
    return comparison.diffRows.filter((r) => r.type !== "matched");
  }, [comparison, showIdentical]);

  return (
    <div className="space-y-3">
      <Card className="p-4 sticky top-3 z-30 bg-slate-900/95 backdrop-blur-md shadow-md border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl">Notebook Workspace</p>
            <p className="mt-1 text-sm text-muted">Editor-first execution flow for Spark SQL and Spark DataFrame commands.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="gap-2"
              onClick={() => setCompareOpen((open) => !open)}
            >
              <GitCompare size={16} />
              {compareOpen ? "Hide Compare" : "Compare Results"}
            </Button>
            <Button variant="ghost" className="gap-2" onClick={() => setExplorerOpen((open) => !open)}>
              <Database size={16} />
              {explorerOpen ? "Hide Datasets" : "Show Datasets"}
            </Button>
            <Button className="gap-2" onClick={addCell}>
              <Plus size={16} />
              Add Cell
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Datasets: {datasets.length}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Connections: {datasources.length}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Cells: {cells.length}</span>
        </div>
      </Card>

      {/* Dataset Explorer */}
      {explorerOpen && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Dataset Explorer</p>
              <p className="mt-1 text-sm text-muted">Open only when you need dataset context.</p>
            </div>
            <Button variant="ghost" onClick={() => setExplorerOpen(false)}>
              <PanelRightClose size={16} />
            </Button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {datasets.map((dataset) => (
              <div key={dataset.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <p className="font-medium">{dataset.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {dataset.source_type} · {dataset.row_count} rows
                </p>
              </div>
            ))}
            {!datasets.length && <p className="text-sm text-muted">Register datasets to make them queryable inside notebook cells.</p>}
          </div>
        </Card>
      )}

      {/* Compare Panel */}
      {compareOpen && (
        <Card className="p-4 border border-white/5 bg-slate-950/20">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Compare Query Results</p>
              <p className="mt-1 text-sm text-muted">Select two completed cells with result sets to compare structures and data.</p>
            </div>
            <Button variant="ghost" className="h-7 w-7 p-0 rounded-md" onClick={() => setCompareOpen(false)}>
              <PanelRightClose size={16} />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Source (A):</span>
              <Select
                className="h-8 py-0 px-2 text-xs rounded bg-slate-950 border-white/10 min-w-[130px]"
                value={cellIdA}
                onChange={(e) => {
                  setCellIdA(e.target.value);
                  setMatchKey("");
                }}
              >
                <option value="">Select cell...</option>
                {completedCells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Target (B):</span>
              <Select
                className="h-8 py-0 px-2 text-xs rounded bg-slate-950 border-white/10 min-w-[130px]"
                value={cellIdB}
                onChange={(e) => {
                  setCellIdB(e.target.value);
                  setMatchKey("");
                }}
              >
                <option value="">Select cell...</option>
                {completedCells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>

            {commonCols.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Align key:</span>
                <Select
                  className="h-8 py-0 px-2 text-xs rounded bg-slate-950 border-white/10 min-w-[150px]"
                  value={matchKey}
                  onChange={(e) => setMatchKey(e.target.value)}
                >
                  <option value="">Auto (Index-based)</option>
                  {commonCols.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {comparison ? (
            <div className="space-y-4">
              {/* Schema Differences */}
              {(comparison.schemaDiff.inAOnly.length > 0 || comparison.schemaDiff.inBOnly.length > 0) ? (
                <div className="rounded-md border border-white/5 bg-slate-950/40 p-2.5 space-y-1.5">
                  <p className="text-[11px] font-bold text-muted uppercase">Schema Changes</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {comparison.schemaDiff.inAOnly.map((col) => (
                      <span key={col} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded">
                        - {col}
                      </span>
                    ))}
                    {comparison.schemaDiff.inBOnly.map((col) => (
                      <span key={col} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                        + {col}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded-md p-2">
                  ✓ Schemas match perfectly
                </div>
              )}

              {/* Data Diff Table */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-1">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Data Differences</p>
                  <div className="flex items-center gap-4 text-[10px] text-muted">
                    {/* Legend */}
                    <div className="flex items-center gap-3 select-none">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-emerald-500" />
                        <span>Added</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-rose-500" />
                        <span>Removed</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-amber-500" />
                        <span>Modified</span>
                      </span>
                    </div>

                    {/* Toggle Show Identical */}
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-ink select-none">
                      <input
                        type="checkbox"
                        checked={showIdentical}
                        onChange={(e) => setShowIdentical(e.target.checked)}
                        className="rounded bg-slate-950 border-white/10 text-accent focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>Show identical rows ({comparison.diffRows.filter(r => r.type === "matched").length})</span>
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border border-white/5 bg-slate-950/40 max-h-80">
                  <table className="min-w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 border-b border-white/5 text-muted select-none">
                      <tr>
                        <th className="px-3 py-1.5 font-bold border-r border-white/5 w-12 text-center">Diff</th>
                        {comparison.colsUnion.map((col) => (
                          <th key={col} className="px-3 py-1.5 font-bold border-r border-white/5">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedDiffRows.map((row, idx) => {
                        const isAdded = row.type === "added";
                        const isRemoved = row.type === "removed";
                        const isModified = row.type === "modified";
                        
                        return (
                          <tr
                            key={idx}
                            className={[
                              "border-b border-white/5 transition",
                              isAdded && "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300",
                              isRemoved && "bg-rose-500/10 hover:bg-rose-500/15 text-rose-300 line-through decoration-rose-500/50",
                              isModified && "bg-amber-500/5 hover:bg-amber-500/10 text-amber-300",
                              !isAdded && !isRemoved && !isModified && "hover:bg-white/5 text-muted",
                            ].filter(Boolean).join(" ")}
                          >
                            <td className="px-3 py-1.5 border-r border-white/5 font-bold text-center select-none text-[10px] align-middle">
                              {isAdded && "+"}
                              {isRemoved && "-"}
                              {isModified && "Δ"}
                              {!isAdded && !isRemoved && !isModified && " "}
                            </td>
                            {comparison.colsUnion.map((col) => {
                              const valA = row.dataA?.[col];
                              const valB = row.dataB?.[col];
                              const isColDiff = isModified && row.diffFields?.includes(col);

                              return (
                                <td
                                  key={col}
                                  className={[
                                    "px-3 py-1.5 border-r border-white/5 max-w-xs truncate align-middle",
                                    isColDiff && "bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold",
                                  ].filter(Boolean).join(" ")}
                                  title={
                                    isColDiff
                                      ? `Source: ${String(valA ?? "")}\nTarget: ${String(valB ?? "")}`
                                      : String(valB ?? valA ?? "")
                                  }
                                >
                                  {isColDiff ? (
                                    <div className="inline-flex items-center flex-wrap gap-1">
                                      <span className="line-through text-rose-400/80 bg-rose-500/15 px-1 py-0.5 rounded text-[10px] select-none decoration-rose-500/50">
                                        {String(valA ?? "")}
                                      </span>
                                      <span className="text-muted/40 text-[10px] select-none">➔</span>
                                      <span className="text-emerald-400 bg-emerald-500/15 px-1 py-0.5 rounded text-[10px] font-medium">
                                        {String(valB ?? "")}
                                      </span>
                                    </div>
                                  ) : (
                                    String(valB ?? valA ?? "")
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {displayedDiffRows.length === 0 && (
                        <tr>
                          <td colSpan={comparison.colsUnion.length + 1} className="py-8 text-center text-xs text-muted/50 bg-slate-900/10">
                            No differences found in the current view. 
                            {comparison.diffRows.length > 0 && " Click 'Show identical rows' to view matched lines."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted/60 text-center py-6 border border-dashed border-white/10 rounded-md">
              Please select two query cells above to view structural and row comparisons.
            </div>
          )}
        </Card>
      )}

      {/* Cells List */}
      <div className="space-y-3">
        {cells.map((cell, index) => (
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
    </div>
  );
}

