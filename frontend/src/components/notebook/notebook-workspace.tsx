import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useWorkspaceStore } from "../../store/workspace-store";
import { Button, Card } from "../shared/ui";
import { NotebookCellView } from "./notebook-cell";

export function NotebookWorkspace() {
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });
  const { cells, addCell, updateCell, deleteCell, duplicateCell, moveCell } = useWorkspaceStore();
  const [explorerOpen, setExplorerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl">Notebook Workspace</p>
            <p className="mt-1 text-sm text-muted">Editor-first execution flow for Spark SQL and Spark DataFrame commands.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
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
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Context Panel</p>
              <p className="mt-1 text-sm text-muted">Compact references instead of a permanently open explorer.</p>
            </div>
            {!explorerOpen && (
              <Button variant="ghost" onClick={() => setExplorerOpen(true)}>
                <PanelRightOpen size={16} />
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <p className="font-medium">Spark SQL</p>
              <p className="mt-1 text-xs text-muted">Dataset-focused SELECT, JOIN, and aggregation work.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <p className="font-medium">Spark DataFrame</p>
              <p className="mt-1 text-xs text-muted">Python-style transformations against the selected dataset context.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
              <p className="font-medium">Starter Template</p>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted">
{`SELECT *
FROM customers
LIMIT 25;`}
              </pre>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
