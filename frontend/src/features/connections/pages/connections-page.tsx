import { PencilLine } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Datasource, DatasourceDraft } from "../../../types/domain";
import { Button, Card, Field, Input, Select } from "../../../components/shared/ui";

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

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const { data: datasources = [] } = useQuery({ queryKey: ["datasources"], queryFn: api.listDatasources });
  const [draft, setDraft] = useState(initialDraft);
  const [testMessage, setTestMessage] = useState("");
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
      queryClient.invalidateQueries({ queryKey: ["datasources"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.testDatasource(draft),
    onSuccess: (response) => setTestMessage(response.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDatasource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const isEditing = editingId !== null;

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="p-5">
        <p className="font-display text-2xl">{isEditing ? "Edit Connection" : "Runtime Connections"}</p>
        <p className="mt-2 text-sm text-muted">
          {isEditing
            ? "Update the runtime connection details. Leave password blank to keep the existing secret."
            : "Create secure, runtime-managed connections without exposing stored passwords back to the UI."}
        </p>
        <div className="mt-5 grid gap-4">
          <Field label="Name">
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
              <option>SPARK</option>
              <option>HIVE</option>
              <option>ORACLE</option>
              <option>POSTGRESQL</option>
              <option>MYSQL</option>
            </Select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Host">
              <Input value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={draft.port}
                onChange={(event) => setDraft({ ...draft, port: Number(event.target.value) })}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Database">
              <Input value={draft.database} onChange={(event) => setDraft({ ...draft, database: event.target.value })} />
            </Field>
            <Field label="Schema">
              <Input value={draft.schema_name} onChange={(event) => setDraft({ ...draft, schema_name: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Username">
              <Input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
            </Field>
            <Field label="Password">
              <Input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
            </Field>
          </div>
          <Field label="JDBC URL">
            <Input value={draft.jdbc_url} onChange={(event) => setDraft({ ...draft, jdbc_url: event.target.value })} />
          </Field>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => testMutation.mutate()}>
              Test Connection
            </Button>
            <Button className="flex-1" onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}>
              {isEditing ? "Update Connection" : "Save Connection"}
            </Button>
          </div>
          {isEditing && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setEditingId(null);
                setDraft(initialDraft);
                setTestMessage("");
              }}
            >
              Cancel Edit
            </Button>
          )}
          <p className="text-xs text-muted">{testMessage}</p>
        </div>
      </Card>
      <Card className="p-5">
        <p className="font-display text-2xl">Connection Inventory</p>
        <p className="mt-2 text-sm text-muted">Configured connections are loaded from YAML and environment sources alongside runtime entries.</p>
        <div className="mt-5 grid gap-3">
          {datasources.map((datasource) => (
            <div key={datasource.id} className="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{datasource.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                    {datasource.type} · {datasource.host}:{datasource.port}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-muted">
                  {datasource.runtime_managed ? "runtime" : "configured"}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">
                {datasource.database || "default"} / {datasource.schema_name || "public"}
              </p>
              {datasource.runtime_managed && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="ghost"
                    className="gap-2"
                    onClick={() => {
                      setEditingId(datasource.id);
                      setDraft(datasourceToDraft(datasource));
                      setTestMessage("");
                    }}
                  >
                    <PencilLine size={16} />
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => deleteMutation.mutate(datasource.id)}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
