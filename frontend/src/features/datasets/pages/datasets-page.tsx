import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Database, Eye, Trash2, ChevronDown, Search, X } from "lucide-react";
import { clsx } from "clsx";
import { api } from "../../../lib/api";
import type { Dataset } from "../../../types/domain";

export function DatasetsPage() {
  const queryClient = useQueryClient();
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: api.listDatasets });
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadToken, setUploadToken] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("finance, curated");
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(
    () =>
      datasets.filter((dataset) =>
        `${dataset.name} ${dataset.source_type} ${dataset.tags.join(" ")}`.toLowerCase().includes(deferredSearch.toLowerCase()),
      ),
    [datasets, deferredSearch],
  );

  const { data: previewData } = useQuery({
    queryKey: ["dataset-preview", previewId],
    queryFn: () => api.getDatasetPreview(previewId!),
    enabled: !!previewId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file to upload");
      const uploaded = await api.uploadDataset(file);
      setUploadToken(uploaded.upload_token);
      setDatasetName(file.name.split(".")[0] || "dataset");
      return uploaded;
    },
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      api.registerDataset({
        upload_token: uploadToken!,
        dataset_name: datasetName,
        description,
        tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
        delimiter,
        has_header: hasHeader,
        infer_schema: true,
      }),
    onSuccess: () => {
      setFile(null);
      setUploadToken(null);
      setDatasetName("");
      setDescription("");
      setDelimiter(",");
      setHasHeader(true);
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDataset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      if (previewId) setPreviewId(null);
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Dataset Management</h1>
          <p className="text-xs text-muted/60 mt-0.5">Upload, register, and explore datasets for notebook execution</p>
        </div>
        <span className="text-[10px] text-muted/30 bg-white/[0.03] px-2.5 py-1 rounded-full border border-white/[0.06]">
          {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Upload Panel */}
        <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3">
          <p className="text-sm font-bold text-ink">Upload & Register</p>
          <p className="text-[11px] text-muted/50">Stage a file, then register it as a queryable dataset.</p>

          {/* File input */}
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] text-muted/40 uppercase tracking-wider font-bold">File</span>
              <input
                type="file"
                className="mt-1 w-full text-xs text-muted/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-white/[0.08] file:bg-white/[0.03] file:text-xs file:font-medium file:text-ink hover:file:bg-white/[0.06] file:transition-colors file:cursor-pointer"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-slate-950 text-xs font-bold hover:brightness-110 transition disabled:opacity-40"
              onClick={() => uploadMutation.mutate()}
              disabled={!file || uploadMutation.isPending}
            >
              <Upload size={13} />
              Stage Upload
            </button>
          </div>

          {/* Registration form */}
          {uploadToken && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <FormField label="Dataset Name" value={datasetName} onChange={setDatasetName} />
              <FormField label="Description" value={description} onChange={setDescription} multiline />
              <FormField label="Tags" value={tags} onChange={setTags} placeholder="comma-separated" />
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Delimiter" value={delimiter} onChange={setDelimiter} />
                <label className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                    className="rounded border-white/[0.1] bg-slate-950 text-accent"
                  />
                  <span className="text-[10px] text-muted/50">Has header</span>
                </label>
              </div>
              <button
                className="w-full px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:brightness-110 transition disabled:opacity-40"
                onClick={() => registerMutation.mutate()}
                disabled={!uploadToken || registerMutation.isPending}
              >
                Register Dataset
              </button>
            </div>
          )}

          {/* Status messages */}
          {(uploadMutation.error || registerMutation.error || uploadMutation.data) && (
            <div className="text-[10px] text-muted/60 bg-white/[0.02] rounded-md p-2">
              {uploadMutation.error instanceof Error && <span className="text-rose-400">{uploadMutation.error.message}</span>}
              {registerMutation.error instanceof Error && <span className="text-rose-400">{registerMutation.error.message}</span>}
              {uploadMutation.data && <span className="text-emerald-400">Staged {uploadMutation.data.filename} ({uploadMutation.data.detected_format})</span>}
            </div>
          )}
        </div>

        {/* Dataset Catalog */}
        <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3">
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 py-1.5 focus-within:border-accent/20 transition-colors">
              <Search size={12} className="text-muted/30" />
              <input
                placeholder="Search datasets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-xs text-ink outline-none w-full placeholder:text-muted/20"
              />
            </div>
          </div>

          {/* Dataset list */}
          <div className="space-y-1.5">
            {filtered.map((dataset) => (
              <div
                key={dataset.id}
                className={clsx(
                  "rounded-lg border p-3 transition-all cursor-pointer group",
                  previewId === dataset.id
                    ? "border-accent/20 bg-accent/[0.03]"
                    : "border-white/[0.04] hover:border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.02]"
                )}
                onClick={() => setPreviewId(previewId === dataset.id ? null : dataset.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Database size={13} className="text-emerald-400/60 shrink-0" />
                      <span className="text-sm font-medium text-ink truncate">{dataset.name}</span>
                    </div>
                    <p className="text-[10px] text-muted/40 mt-0.5 ml-5">
                      {dataset.source_type} · {dataset.row_count} rows · {dataset.schema?.length ?? 0} cols
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded hover:bg-white/[0.06] text-muted/40 hover:text-ink transition"
                      onClick={(e) => { e.stopPropagation(); setPreviewId(dataset.id); }}
                      title="Preview"
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-rose-500/10 text-muted/40 hover:text-rose-400 transition"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(dataset.id); }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Schema pills */}
                {dataset.schema && dataset.schema.length > 0 && (
                  <div className="mt-2 ml-5 flex flex-wrap gap-1">
                    {dataset.schema.slice(0, 8).map((col, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.03] text-muted/40 font-mono">
                        {col.name}
                      </span>
                    ))}
                    {dataset.schema.length > 8 && (
                      <span className="text-[9px] px-1.5 py-0.5 text-muted/30">
                        +{dataset.schema.length - 8} more
                      </span>
                    )}
                  </div>
                )}

                {/* Tags */}
                {dataset.tags.length > 0 && (
                  <div className="mt-1.5 ml-5 flex flex-wrap gap-1">
                    {dataset.tags.map((tag, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/[0.06] text-accent/60 border border-accent/10">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-8">
                <Database size={24} className="text-muted/20 mx-auto mb-2" />
                <p className="text-xs text-muted/30">
                  {search ? "No datasets match your search" : "No datasets registered yet"}
                </p>
              </div>
            )}
          </div>

          {/* Preview panel */}
          {previewId && previewData && (
            <div className="rounded-lg border border-white/[0.06] bg-slate-950/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted/40 font-bold">
                  Data Preview · {previewData.row_count} rows
                </p>
                <button
                  className="p-1 rounded hover:bg-white/[0.06] text-muted/30 hover:text-muted transition"
                  onClick={() => setPreviewId(null)}
                >
                  <X size={12} />
                </button>
              </div>
              <div className="overflow-x-auto rounded-md border border-white/[0.04] max-h-48">
                <table className="min-w-full text-xs font-mono">
                  <thead className="bg-slate-900/60 border-b border-white/[0.04] sticky top-0">
                    <tr>
                      {previewData.schema.map((col) => (
                        <th key={col.name} className="px-2 py-1 text-[10px] text-muted/40 font-bold text-left border-r border-white/[0.04]">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.slice(0, 20).map((row, idx) => (
                      <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        {previewData.schema.map((col) => (
                          <td key={col.name} className="px-2 py-0.5 text-muted/60 border-r border-white/[0.03] max-w-[150px] truncate">
                            {String((row as any)[col.name] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls = "w-full mt-1 bg-slate-950/60 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/20 transition-colors";
  return (
    <label className="block">
      <span className="text-[10px] text-muted/40 uppercase tracking-wider font-bold">{label}</span>
      {multiline ? (
        <textarea className={`${cls} min-h-[60px] resize-y`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}
