import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, Columns, Info, Layers } from "lucide-react";
import { api } from "../../lib/api";
import { useNotebookStore } from "../../store/notebook-store";

export function SidebarRight() {
  const { cells, activeCellId, activeNotebook } = useNotebookStore();
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });

  const activeCell = cells.find((c) => c.id === activeCellId);
  const lastResult = activeCell?.result || activeCell?.last_result;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted/50 font-bold">Inspector</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
        {/* Notebook Info */}
        {activeNotebook && (
          <InspectorSection icon={Info} title="Notebook">
            <div className="space-y-1.5">
              <InfoRow label="Name" value={activeNotebook.name} />
              <InfoRow label="Cells" value={String(cells.length)} />
              <InfoRow label="Created" value={new Date(activeNotebook.created_at).toLocaleDateString()} />
            </div>
          </InspectorSection>
        )}

        {/* Active Cell */}
        {activeCell && (
          <InspectorSection icon={Layers} title="Active Cell">
            <div className="space-y-1.5">
              <InfoRow label="Type" value={activeCell.cell_type} />
              <InfoRow label="Engine" value={activeCell.engine} />
              <InfoRow label="Status" value={activeCell.status} />
              {activeCell.durationMs !== undefined && (
                <InfoRow label="Duration" value={`${activeCell.durationMs}ms`} />
              )}
            </div>
          </InspectorSection>
        )}

        {/* Schema Browser */}
        <InspectorSection icon={Columns} title="Schema">
          {lastResult && lastResult.schema && lastResult.schema.length > 0 ? (
            <div className="space-y-0.5">
              {lastResult.schema.map((col: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] text-muted/20 w-4 text-right">{idx + 1}</span>
                  <span className="text-[11px] text-ink/70 font-mono truncate">{col.name}</span>
                  <span className="text-[9px] text-muted/30 ml-auto">{col.type}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted/30">Run a cell to see its result schema</p>
          )}
        </InspectorSection>

        {/* Execution Metadata */}
        {lastResult && (
          <InspectorSection icon={Activity} title="Execution">
            <div className="space-y-1.5">
              <InfoRow
                label="Time"
                value={`${(lastResult as any).execution_time_ms || (lastResult as any).metadata?.executionTimeMs || 0}ms`}
              />
              <InfoRow label="Rows" value={String((lastResult as any).row_count ?? lastResult.rows?.length ?? 0)} />
              <InfoRow label="Status" value={(lastResult as any).status || "unknown"} />
              {(lastResult as any).execution_type && (
                <InfoRow label="Type" value={(lastResult as any).execution_type} />
              )}
            </div>
          </InspectorSection>
        )}

        {/* Variables */}
        <InspectorSection icon={Clock} title="Datasets in Scope">
          {datasets.length > 0 ? (
            <div className="space-y-0.5">
              {datasets.slice(0, 10).map((ds) => (
                <div key={ds.id} className="flex items-center gap-2 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
                  <span className="text-[11px] text-ink/60 truncate">{ds.name}</span>
                  <span className="text-[9px] text-muted/30 ml-auto">{ds.row_count}r</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted/30">No datasets registered</p>
          )}
        </InspectorSection>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function InspectorSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<any>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={11} className="text-muted/30" />
        <span className="text-[10px] uppercase tracking-wider text-muted/40 font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted/40">{label}</span>
      <span className="text-[11px] text-ink/60 font-mono">{value}</span>
    </div>
  );
}
