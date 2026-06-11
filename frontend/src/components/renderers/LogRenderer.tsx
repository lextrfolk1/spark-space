import { ChevronDown } from "lucide-react";
import type { RendererProps } from "./index";

export function LogRenderer({ result, className }: RendererProps) {
  const logs = result.logs ?? [];
  const warnings = result.warnings ?? [];

  if (logs.length === 0 && warnings.length === 0) return null;

  return (
    <details className={`group ${className ?? ""}`} open={!result.rows || result.rows.length === 0}>
      <summary className="list-none flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-ink select-none font-bold font-mono">
        <span>Execution Console</span>
        <span className="text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded">
          {logs.length + warnings.length} entries
        </span>
        <ChevronDown size={12} className="transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-0.5 bg-slate-950/50 p-2.5 rounded-lg border border-white/[0.06] font-mono text-[11px] text-muted max-h-40 overflow-y-auto">
        {warnings.map((line, idx) => (
          <div key={`warn-${idx}`} className="text-amber-400/80 flex items-start gap-1.5">
            <span className="text-amber-500/50 select-none shrink-0">⚠</span>
            <span>{line}</span>
          </div>
        ))}
        {logs.map((line, idx) => (
          <div key={`log-${idx}`} className="flex items-start gap-1.5 text-muted/60">
            <span className="text-muted/20 select-none shrink-0">›</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
