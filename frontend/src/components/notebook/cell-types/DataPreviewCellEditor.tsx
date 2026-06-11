import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { api } from "../../../lib/api";

type Props = {
  datasetId?: string;
  onChange: (patch: { content?: string; metadata?: Record<string, unknown>; datasetIds?: string[] }) => void;
};

export function DataPreviewCellEditor({ datasetId, onChange }: Props) {
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });

  const selected = datasets.find((d) => d.id === datasetId);

  return (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden bg-slate-950/40">
      <div className="px-3 py-2.5 space-y-2">
        {/* Dataset selector */}
        <div className="flex items-center gap-2">
          <Database size={13} className="text-emerald-400/60 shrink-0" />
          <select
            className="flex-1 h-7 text-xs bg-slate-950 border border-white/[0.08] rounded-md px-2 text-ink outline-none"
            value={datasetId || ""}
            onChange={(e) =>
              onChange({
                content: e.target.value,
                metadata: { dataset: e.target.value },
                datasetIds: e.target.value ? [e.target.value] : [],
              })
            }
          >
            <option value="">Select a dataset to preview...</option>
            {datasets.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.name} ({ds.row_count} rows)
              </option>
            ))}
          </select>
        </div>

        {/* Schema preview */}
        {selected && selected.schema && selected.schema.length > 0 && (
          <div className="rounded-md border border-white/[0.04] bg-slate-950/30 p-2">
            <p className="text-[9px] uppercase tracking-wider text-muted/30 font-bold mb-1.5">
              Schema · {selected.schema.length} columns
            </p>
            <div className="flex flex-wrap gap-1">
              {selected.schema.map((col, idx) => (
                <span
                  key={idx}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-muted/50 font-mono"
                >
                  {col.name}
                  <span className="text-muted/20 ml-0.5">{col.type}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
