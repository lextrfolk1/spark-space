import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Card } from "../../../components/shared/ui";

export function HistoryPage() {
  const { data: history = [] } = useQuery({ queryKey: ["history"], queryFn: api.listExecutionHistory });

  return (
    <Card className="p-5">
      <p className="font-display text-2xl">Execution History</p>
      <p className="mt-2 text-sm text-muted">Rerun, clone, and audit executions through the shared history contract.</p>
      <div className="mt-5 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted">
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Engine</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Command</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id} className="border-b border-white/5">
                <td className="px-3 py-3 text-muted">{new Date(item.created_at).toLocaleString()}</td>
                <td className="px-3 py-3 text-muted">{item.engine}</td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-muted">{item.status}</span>
                </td>
                <td className="px-3 py-3 text-muted">{item.duration_ms} ms</td>
                <td className="max-w-[520px] truncate px-3 py-3 font-mono text-xs text-muted">{item.command}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

