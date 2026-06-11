import { PencilLine, Plug, ShieldCheck, Trash2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api } from "../../../lib/api";
import type { Datasource, DatasourceDraft } from "../../../types/domain";

const initialDraft: DatasourceDraft = {
  name: "",
  type: "POSTGRESQL",
  host: "",
  port: 5432,
  database: "",
  schema_name: "",
  username: "",
  password: "",
  jdbc_url: "",
  metadata: {},
};

function datasourceToDraft(datasource: Datasource): DatasourceDraft {
  return {
    name: datasource.name,
    type: datasource.type,
    host: datasource.host,
    port: datasource.port,
    database: datasource.database ?? "",
    schema_name: datasource.schema_name ?? "",
    username: datasource.username ?? "",
    password: "",
    jdbc_url: datasource.jdbc_url ?? "",
    metadata: datasource.metadata ?? {},
  };
}

const TYPE_COLORS: Record<string, string> = {
  SPARK: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  POSTGRESQL: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  MYSQL: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  ORACLE: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  HIVE: "text-amber-400 bg-amber-400/10 border-amber-400/20",
};

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });
  const [draft, setDraft] = useState(initialDraft);
  const [testMessage, setTestMessage] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.createDatasource(draft),
    onSuccess: () => {
      setDraft(initialDraft);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["datasources"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.updateDatasource(editingId!, draft),
    onSuccess: () => {
      setDraft(initialDraft);
      setEditingId(null);
      setTestMessage("Connection updated.");
      setTestStatus("success");
      queryClient.invalidateQueries({ queryKey: ["datasources"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.testDatasource(draft),
    onSuccess: (response) => {
      setTestMessage(response.message);
      setTestStatus(response.success ? "success" : "error");
    },
    onError: (error) => {
      setTestMessage(String(error));
      setTestStatus("error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDatasource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const isEditing = editingId !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Connection Manager</h1>
          <p className="text-xs text-muted/60 mt-0.5">Configure database connections for notebook execution</p>
        </div>
        <span className="text-[10px] text-muted/30 bg-white/[0.03] px-2.5 py-1 rounded-full border border-white/[0.06]">
          {datasources.length} connection{datasources.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Connection Form */}
        <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plug size={14} className="text-accent" />
            <p className="text-sm font-bold text-ink">{isEditing ? "Edit Connection" : "New Connection"}</p>
          </div>
          <p className="text-[10px] text-muted/40">
            {isEditing
              ? "Update connection details. Leave password blank to keep the existing secret."
              : "Create a runtime-managed connection."}
          </p>

          <div className="space-y-2.5">
            <FormField label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />

            <label className="block">
              <span className="text-[10px] text-muted/40 uppercase tracking-wider font-bold">Type</span>
              <select
                className="w-full mt-1 bg-slate-950/60 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/20 transition-colors"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              >
                <option>SPARK</option>
                <option>HIVE</option>
                <option>ORACLE</option>
                <option>POSTGRESQL</option>
                <option>MYSQL</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <FormField label="Host" value={draft.host} onChange={(v) => setDraft({ ...draft, host: v })} />
              <FormField
                label="Port"
                value={String(draft.port)}
                onChange={(v) => setDraft({ ...draft, port: Number(v) || 0 })}
              />
            </div>

            <p className="text-[9px] text-muted/30">
              Docker? Use <code className="text-muted/50">host.docker.internal</code> instead of <code className="text-muted/50">localhost</code>.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <FormField label="Database" value={draft.database ?? ""} onChange={(v) => setDraft({ ...draft, database: v })} />
              <FormField label="Schema" value={draft.schema_name ?? ""} onChange={(v) => setDraft({ ...draft, schema_name: v })} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FormField label="Username" value={draft.username ?? ""} onChange={(v) => setDraft({ ...draft, username: v })} />
              <FormField label="Password" value={draft.password ?? ""} onChange={(v) => setDraft({ ...draft, password: v })} type="password" />
            </div>

            <FormField label="JDBC URL" value={draft.jdbc_url ?? ""} onChange={(v) => setDraft({ ...draft, jdbc_url: v })} placeholder="Optional" />

            <div className="flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] text-xs font-medium text-muted hover:text-ink hover:bg-white/[0.03] transition"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ShieldCheck size={12} />
                )}
                Test
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-accent text-slate-950 text-xs font-bold hover:brightness-110 transition"
                onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
              >
                {isEditing ? "Update" : "Save"}
              </button>
            </div>

            {isEditing && (
              <button
                className="w-full px-3 py-1.5 rounded-lg border border-white/[0.06] text-xs text-muted/50 hover:text-muted hover:bg-white/[0.02] transition"
                onClick={() => { setEditingId(null); setDraft(initialDraft); setTestMessage(""); setTestStatus("idle"); }}
              >
                Cancel Edit
              </button>
            )}

            {testMessage && (
              <div className={clsx(
                "flex items-center gap-2 text-[10px] p-2 rounded-md border",
                testStatus === "success" ? "text-emerald-400 bg-emerald-500/[0.04] border-emerald-500/10" : "text-rose-400 bg-rose-500/[0.04] border-rose-500/10"
              )}>
                {testStatus === "success" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {testMessage}
              </div>
            )}
          </div>
        </div>

        {/* Connection Inventory */}
        <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3">
          <p className="text-sm font-bold text-ink">Connection Inventory</p>
          <p className="text-[10px] text-muted/40">Configured and runtime-managed connections.</p>

          <div className="space-y-2">
            {datasources.map((ds) => (
              <div
                key={ds.id}
                className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 hover:border-white/[0.08] hover:bg-white/[0.02] transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "text-[9px] px-1.5 py-0.5 rounded-md font-bold border",
                        TYPE_COLORS[ds.type] || "text-muted/50 bg-white/[0.04] border-white/[0.06]"
                      )}>
                        {ds.type}
                      </span>
                      <span className="text-sm font-medium text-ink truncate">{ds.name}</span>
                    </div>
                    <p className="text-[10px] text-muted/40 mt-1">
                      {ds.host}:{ds.port} / {ds.database || "default"} / {ds.schema_name || "public"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={clsx(
                      "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                      ds.runtime_managed
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-white/[0.04] text-muted/40 border border-white/[0.06]"
                    )}>
                      {ds.runtime_managed ? "runtime" : "configured"}
                    </span>
                  </div>
                </div>

                {ds.runtime_managed && (
                  <div className="flex gap-1.5 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/[0.06] text-[10px] text-muted/50 hover:text-ink hover:bg-white/[0.03] transition"
                      onClick={() => { setEditingId(ds.id); setDraft(datasourceToDraft(ds)); setTestMessage(""); setTestStatus("idle"); }}
                    >
                      <PencilLine size={10} />
                      Edit
                    </button>
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/10 text-[10px] text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/[0.04] transition"
                      onClick={() => deleteMutation.mutate(ds.id)}
                    >
                      <Trash2 size={10} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}

            {datasources.length === 0 && (
              <div className="text-center py-8">
                <Plug size={24} className="text-muted/20 mx-auto mb-2" />
                <p className="text-xs text-muted/30">No connections configured yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-muted/40 uppercase tracking-wider font-bold">{label}</span>
      <input
        type={type}
        className="w-full mt-1 bg-slate-950/60 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/20 transition-colors"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
