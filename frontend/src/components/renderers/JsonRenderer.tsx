import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { RendererProps } from "./index";

function JsonNode({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (data === null) return <span className="text-muted/40 italic">null</span>;
  if (data === undefined) return <span className="text-muted/40 italic">undefined</span>;
  if (typeof data === "string") return <span className="text-emerald-400">"{data}"</span>;
  if (typeof data === "number") return <span className="text-sky-400">{data}</span>;
  if (typeof data === "boolean") return <span className="text-amber-400">{String(data)}</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted/40">[]</span>;
    return (
      <div className="inline">
        <button
          className="inline-flex items-center gap-0.5 text-muted/60 hover:text-ink transition"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight size={10} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="text-[10px]">Array({data.length})</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-white/[0.06] pl-3 mt-0.5">
            {data.map((item, idx) => (
              <div key={idx} className="py-0.5">
                <span className="text-muted/30 text-[10px] mr-2">{idx}</span>
                <JsonNode data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) return <span className="text-muted/40">{"{}"}</span>;
    return (
      <div className="inline">
        <button
          className="inline-flex items-center gap-0.5 text-muted/60 hover:text-ink transition"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight size={10} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="text-[10px]">{`{${entries.length}}`}</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-white/[0.06] pl-3 mt-0.5">
            {entries.map(([key, val]) => (
              <div key={key} className="py-0.5">
                <span className="text-violet-400 font-medium">{key}</span>
                <span className="text-muted/30 mx-1">:</span>
                <JsonNode data={val} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

export function JsonRenderer({ result, className }: RendererProps) {
  const data = result.rows?.length
    ? result.rows
    : (result as any).metadata ?? {};

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-slate-950/40 p-3 font-mono text-xs max-h-72 overflow-auto ${className ?? ""}`}>
      <JsonNode data={data} />
    </div>
  );
}
