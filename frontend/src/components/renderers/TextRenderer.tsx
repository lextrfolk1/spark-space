import type { RendererProps } from "./index";

export function TextRenderer({ result, className }: RendererProps) {
  const content = (result as any).content || (result as any).generated_query || "";
  const logs = result.logs ?? [];

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-slate-950/40 p-3.5 ${className ?? ""}`}>
      {content && (
        <div className="text-sm text-ink/80 whitespace-pre-wrap leading-relaxed font-mono">
          {content}
        </div>
      )}
      {!content && logs.length > 0 && (
        <div className="space-y-1">
          {logs.map((log, idx) => (
            <div key={idx} className="text-xs text-muted/70 font-mono">
              {log}
            </div>
          ))}
        </div>
      )}
      {!content && logs.length === 0 && (
        <div className="text-xs text-muted/40 text-center py-4">No output.</div>
      )}
    </div>
  );
}
