import type { RendererProps } from "./index";

export function SchemaRenderer({ result, className }: RendererProps) {
  const schema = result.schema ?? [];

  if (schema.length === 0) {
    return (
      <div className={`text-xs text-muted/40 text-center py-6 ${className ?? ""}`}>
        No schema information available.
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-slate-950/40 ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-white/[0.06] bg-slate-900/50">
        <p className="text-[10px] uppercase tracking-wider text-muted/60 font-bold">
          Schema · {schema.length} column{schema.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {schema.map((col: any, idx: number) => (
          <div key={idx} className="flex items-center gap-3 px-3 py-1.5 hover:bg-white/[0.02] transition-colors">
            <span className="text-[10px] text-muted/20 font-mono w-5 text-right shrink-0">{idx + 1}</span>
            <span className="text-xs font-medium text-ink/80">{col.name}</span>
            <span className="text-[10px] text-muted/50 bg-white/[0.03] px-1.5 py-0.5 rounded font-mono">
              {col.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
