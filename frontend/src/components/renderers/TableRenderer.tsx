import type { RendererProps } from "./index";

export function TableRenderer({ result, className }: RendererProps) {
  const rows = result.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className={`text-xs text-muted/50 text-center py-6 ${className ?? ""}`}>
        No rows returned.
      </div>
    );
  }

  const columns = Object.keys(rows[0]);

  return (
    <div className={`overflow-x-auto rounded-lg border border-white/[0.06] bg-slate-950/40 max-h-72 ${className ?? ""}`}>
      <table className="min-w-full text-left text-xs font-mono">
        <thead className="bg-slate-900/80 border-b border-white/[0.06] text-muted select-none sticky top-0 z-10">
          <tr>
            <th className="px-2 py-1.5 font-bold border-r border-white/[0.06] text-[10px] text-center w-10 text-muted/40">
              #
            </th>
            {columns.map((col) => (
              <th key={col} className="px-3 py-1.5 font-bold border-r border-white/[0.06] text-[10.5px] uppercase tracking-wider">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
            >
              <td className="px-2 py-1 border-r border-white/[0.06] text-center text-[10px] text-muted/30 font-mono">
                {idx + 1}
              </td>
              {columns.map((col) => (
                <td
                  key={col}
                  className="px-3 py-1 border-r border-white/[0.04] max-w-xs truncate text-muted/80"
                  title={String(row[col] ?? "")}
                >
                  {row[col] === null ? (
                    <span className="text-muted/20 italic">null</span>
                  ) : (
                    String(row[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
