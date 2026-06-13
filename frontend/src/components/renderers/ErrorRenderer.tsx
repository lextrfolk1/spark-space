import { AlertTriangle } from "lucide-react";
import type { RendererProps } from "./index";

export function ErrorRenderer({ result, className }: RendererProps) {
  const error = result.error || "An unknown error occurred.";

  return (
    <div className={`rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3.5 ${className ?? ""}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-md bg-rose-500/10 p-1.5">
          <AlertTriangle size={14} className="text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1.5">
            Execution Failed
          </p>
          {typeof error === "object" && error !== null ? (
            <div className="text-xs text-rose-300/80 font-mono space-y-1">
              <div className="font-semibold text-rose-200">
                {error.message || "An error occurred during execution."}
              </div>
              {error.code && (
                <div className="text-[10px] text-rose-400/70 font-semibold uppercase">
                  Error Code: {error.code}
                </div>
              )}
              {error.details && (
                <pre className="mt-1.5 p-2 bg-rose-950/20 border border-rose-950/30 rounded text-rose-400/90 whitespace-pre-wrap break-all leading-normal">
                  {error.details}
                </pre>
              )}
              {error.hint && (
                <div className="mt-1.5 text-[11px] text-rose-400/60 italic leading-normal">
                  Hint: {error.hint}
                </div>
              )}
            </div>
          ) : (
            <pre className="text-xs text-rose-300/80 font-mono whitespace-pre-wrap break-words leading-relaxed">
              {String(error)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
