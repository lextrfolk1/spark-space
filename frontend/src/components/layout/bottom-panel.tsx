import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, FileText, History, Terminal } from "lucide-react";
import { clsx } from "clsx";
import { api } from "../../lib/api";
import { useNotebookStore } from "../../store/notebook-store";
import { TableRenderer } from "../renderers/TableRenderer";
import { LogRenderer } from "../renderers/LogRenderer";
import { SchemaRenderer } from "../renderers/SchemaRenderer";
import type { BottomPanelTab } from "../../types/domain";

const TABS: { id: BottomPanelTab; label: string; icon: React.ComponentType<any> }[] = [
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "history", label: "History", icon: History },
  { id: "execution-plan", label: "Details", icon: Clock },
];

export function BottomPanel() {
  const { bottomPanelTab, setBottomPanelTab, cells, activeCellId, executionHistory } = useNotebookStore();
  const { data: historyItems = [] } = useQuery({
    queryKey: ["execution-history"],
    queryFn: api.listExecutionHistory,
    refetchInterval: 15000,
  });

  const activeCell = cells.find((c) => c.id === activeCellId);
  const result = activeCell?.result || activeCell?.last_result;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/[0.06] px-1 bg-slate-900/50 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = bottomPanelTab === tab.id;
          return (
            <button
              key={tab.id}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors",
                isActive
                  ? "border-accent text-ink"
                  : "border-transparent text-muted/50 hover:text-muted hover:border-white/10"
              )}
              onClick={() => setBottomPanelTab(tab.id)}
            >
              <Icon size={12} className={isActive ? "text-accent" : ""} />
              {tab.label}
            </button>
          );
        })}
        <div className="flex-1" />
        {result && (
          <span className="text-[9px] text-muted/30 px-2">
            {(result as any).execution_time_ms || (result as any).metadata?.executionTimeMs || 0}ms
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">

        {bottomPanelTab === "logs" && (
          <div>
            {result ? (
              <LogRenderer result={result as any} />
            ) : (
              <EmptyState message="No execution logs yet" />
            )}
          </div>
        )}

        {bottomPanelTab === "history" && (
          <div className="space-y-0.5">
            {historyItems.length > 0 ? (
              <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                <table className="min-w-full text-xs font-mono">
                  <thead className="bg-slate-900/60 border-b border-white/[0.06]">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[10px] text-muted/40 uppercase tracking-wider">Engine</th>
                      <th className="px-3 py-1.5 text-left text-[10px] text-muted/40 uppercase tracking-wider">Command</th>
                      <th className="px-3 py-1.5 text-left text-[10px] text-muted/40 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-1.5 text-right text-[10px] text-muted/40 uppercase tracking-wider">Duration</th>
                      <th className="px-3 py-1.5 text-right text-[10px] text-muted/40 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.slice(0, 50).map((item) => (
                      <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="px-3 py-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted/60">{item.engine}</span>
                        </td>
                        <td className="px-3 py-1.5 text-muted/60 max-w-xs truncate" title={item.command}>
                          {item.command}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={clsx(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            item.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          )}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted/40">{item.duration_ms}ms</td>
                        <td className="px-3 py-1.5 text-right text-muted/30 text-[10px]">
                          {new Date(item.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No execution history yet" />
            )}
          </div>
        )}

        {bottomPanelTab === "execution-plan" && (
          <div>
            {result ? (
              <div className="space-y-3">
                {result.schema && result.schema.length > 0 && (
                  <SchemaRenderer result={result as any} />
                )}
                <div className="rounded-lg border border-white/[0.06] bg-slate-950/40 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted/40 font-bold mb-2">Metadata</p>
                  <div className="space-y-1 text-xs font-mono">
                    {Object.entries((result as any).statistics || (result as any).metadata || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted/40">{key}</span>
                        <span className="text-ink/60">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState message="Run a cell to see execution details" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px]">
      <p className="text-xs text-muted/30">{message}</p>
    </div>
  );
}
