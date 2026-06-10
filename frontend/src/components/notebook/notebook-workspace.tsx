import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useWorkspaceStore } from "../../store/workspace-store";
import { Button, Card } from "../shared/ui";
import { NotebookCellView } from "./notebook-cell";

export function NotebookWorkspace() {
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });
  const { cells, addCell, updateCell, deleteCell, duplicateCell, moveCell } = useWorkspaceStore();

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <Card className="p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-muted">Dataset Explorer</p>
        <div className="mt-4 space-y-3">
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
      <div className="space-y-4">
        <Card className="flex items-center justify-between p-5">
          <div>
            <p className="font-display text-2xl">Notebook Workspace</p>
            <p className="mt-1 text-sm text-muted">Execute selected text, the current cell, or evolve toward a full-notebook engine pipeline.</p>
          </div>
          <Button className="gap-2" onClick={addCell}>
            <Plus size={16} />
            Add Cell
          </Button>
        </Card>
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
      <Card className="p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-muted">Context Panel</p>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="font-medium">Recent Executions</p>
            <p className="mt-2 text-sm text-muted">Each cell writes through the shared execution service, keeping the UI engine-agnostic.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="font-medium">Query Templates</p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted">
{`SELECT *
FROM customers
LIMIT 25;`}
            </pre>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="font-medium">Execution Statistics</p>
            <p className="mt-2 text-sm text-muted">Normalized schema, rows, logs, warnings, and statistics are preserved across engines.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

