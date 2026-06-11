import { startTransition, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Braces,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Play,
  Rows3,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/api";
import { Dataset, Datasource, ExecutionResult, NotebookCell } from "../../types/domain";
import { Button, Card, Select } from "../shared/ui";

const resultTabs = ["results", "schema", "logs", "statistics"] as const;

type NotebookCellProps = {
  cell: NotebookCell;
  datasets: Dataset[];
  datasources: Datasource[];
  onChange: (patch: Partial<NotebookCell>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: "up" | "down") => void;
};

const engineMeta: Record<
  NotebookCell["engine"],
  {
    label: string;
    language: "sql" | "python";
    hint: string;
    datasetLabel: string;
    accentClass: string;
  }
> = {
  spark_sql: {
    label: "Spark SQL",
    language: "sql",
    hint: "Use SQL against the selected dataset or connection.",
    datasetLabel: "Primary dataset",
    accentClass: "bg-emerald-300 text-slate-950",
  },
  spark_dataframe: {
    label: "Spark DataFrame",
    language: "python",
    hint: "Write DataFrame-style Python against the selected dataset context.",
    datasetLabel: "Input dataset",
    accentClass: "bg-sky-300 text-slate-950",
  },
  rule_engine: {
    label: "Rule Engine",
    language: "python",
    hint: "Placeholder engine path for future rule execution planning.",
    datasetLabel: "Rule input",
    accentClass: "bg-amber-300 text-slate-950",
  },
};

export function NotebookCellView({
  cell,
  datasets,
  datasources,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
}: NotebookCellProps) {
  const [activeTab, setActiveTab] = useState<(typeof resultTabs)[number]>("results");
  const meta = engineMeta[cell.engine];
  const selectedDatasets = datasets.filter((dataset) => cell.datasetIds.includes(dataset.id));
  const currentDatasource = datasources.find((item) => item.id === cell.datasourceId);



  const run = async () => {
    onChange({ status: "running" });
    try {
      const result = await api.execute({
        engine: cell.engine,
        datasource_id: cell.datasourceId,
        dataset_ids: cell.datasourceId ? [] : cell.datasetIds,
        command: cell.content,
        execution_mode: "current_cell",
        context: { cellId: cell.id },
      });
      onChange({
        status: result.status === "completed" ? "completed" : "failed",
        durationMs: result.execution_time_ms,
        result,
        datasetIds: result.dataset_ids || [],
      });
      startTransition(() => setActiveTab(result.error ? "logs" : "results"));
    } catch (error) {
      onChange({
        status: "failed",
        result: {
          execution_id: crypto.randomUUID(),
          status: "failed",
          schema: [],
          rows: [],
          row_count: 0,
          dataframe_metadata: {},
          logs: [String(error)],
          warnings: [],
          error: String(error),
          execution_time_ms: 0,
          statistics: {},
        },
      });
      setActiveTab("logs");
    }
  };

  const renderTab = (result?: ExecutionResult) => {
    if (!result) {
      return <p className="text-sm text-muted">Run the cell to inspect results, schema, logs, and execution statistics.</p>;
    }

    if (activeTab === "results") {
      return (
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted">
                {Object.keys(result.rows[0] ?? {}).map((key) => (
                  <th key={key} className="px-3 py-2 font-medium">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={index} className="border-b border-white/5">
                  {Object.entries(row).map(([key, value]) => (
                    <td key={key} className="px-3 py-2 text-muted">
                      {String(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeTab === "schema") {
      return <pre className="overflow-auto rounded-2xl bg-slate-950/35 p-4 text-xs text-muted">{JSON.stringify(result.schema, null, 2)}</pre>;
    }

    if (activeTab === "logs") {
      return (
        <div className="space-y-2">
          {result.logs.concat(result.error ? [result.error] : []).map((line) => (
            <div key={line} className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 font-mono text-xs text-muted">
              {line}
            </div>
          ))}
        </div>
      );
    }

    return <pre className="overflow-auto rounded-2xl bg-slate-950/35 p-4 text-xs text-muted">{JSON.stringify(result.statistics, null, 2)}</pre>;
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="font-display text-lg">{cell.title}</p>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{meta.label}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${meta.accentClass}`}>
              {meta.label}
            </span>
            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                cell.status === "completed" && "bg-emerald-300 text-slate-950",
                cell.status === "running" && "bg-amber-300 text-slate-950",
                cell.status === "failed" && "bg-rose-300 text-slate-950",
                cell.status === "idle" && "bg-white/10 text-muted",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cell.status}
            </span>
            <Button variant="ghost" onClick={() => onChange({ collapsed: !cell.collapsed })}>
              {cell.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{meta.hint}</span>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[180px_1fr_170px]">
          <Select value={cell.engine} onChange={(event) => onChange({ engine: event.target.value as NotebookCell["engine"] })}>
            <option value="spark_sql">Spark SQL</option>
            <option value="spark_dataframe">Spark DataFrame</option>
            <option value="rule_engine">Rule Engine</option>
          </Select>
          <Select value={cell.datasourceId ?? ""} onChange={(event) => onChange({ datasourceId: event.target.value || undefined })}>
            <option value="">Select datasource</option>
            {datasources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" onClick={run}>
              <Play size={16} />
              Execute
            </Button>
            <Button variant="ghost" onClick={() => onChange({ result: undefined, status: "idle" })}>
              <RotateCcw size={16} />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <Database size={12} />
            {selectedDatasets.map((dataset) => dataset.name).join(", ") || "No dataset"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <Braces size={12} />
            {currentDatasource?.name || "No datasource"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <Rows3 size={12} />
            {cell.durationMs ? `${cell.durationMs} ms` : "Not run"}
          </span>
        </div>
      </div>
      {!cell.collapsed && (
        <div>
          <div className="min-w-0 border-b border-white/10">
            <Editor
              height="320px"
              language={meta.language}
              theme="vs-dark"
              value={cell.content}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: "on",
                roundedSelection: false,
                scrollBeyondLastLine: false,
              }}
              onChange={(value) => onChange({ content: value ?? "" })}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
              <Button variant="ghost" onClick={onDuplicate}>
                <Copy size={16} />
              </Button>
              <Button variant="ghost" onClick={() => onMove("up")}>
                <ChevronUp size={16} />
              </Button>
              <Button variant="ghost" onClick={() => onMove("down")}>
                <ChevronDown size={16} />
              </Button>
              <Button variant="danger" onClick={onDelete}>
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
          <div className="min-w-0 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {resultTabs.map((tab) => (
                <button
                  key={tab}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em]",
                    activeTab === tab ? "bg-accent text-slate-950" : "bg-white/5 text-muted",
                  ].join(" ")}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {renderTab(cell.result)}
          </div>
        </div>
      )}
    </Card>
  );
}
