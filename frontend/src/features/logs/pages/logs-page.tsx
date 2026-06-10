import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Card } from "../../../components/shared/ui";

export function LogsPage() {
  const { data: logs = [] } = useQuery({ queryKey: ["logs"], queryFn: api.listLogs, refetchInterval: 10_000 });

  return (
    <Card className="p-5">
      <p className="font-display text-2xl">Operational Logs</p>
      <p className="mt-2 text-sm text-muted">Execution, dataset, and connection events surface here for live troubleshooting.</p>
      <div className="mt-5 space-y-3">
        {logs.map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`} className="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">{entry.level}</span>
              <span className="text-sm text-muted">{entry.source}</span>
              <span className="ml-auto text-xs text-muted">{new Date(entry.timestamp).toLocaleString()}</span>
            </div>
            <p className="mt-3 font-mono text-sm text-ink">{entry.message}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

