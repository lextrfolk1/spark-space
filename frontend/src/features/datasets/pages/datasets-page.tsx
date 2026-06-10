import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { api } from "../../../lib/api";
import { Button, Card, Field, Input, TextArea } from "../../../components/shared/ui";

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

  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(
    () =>
      datasets.filter((dataset) =>
        `${dataset.name} ${dataset.source_type} ${dataset.tags.join(" ")}`.toLowerCase().includes(deferredSearch.toLowerCase()),
      ),
    [datasets, deferredSearch],
  );

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

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-5">
        <p className="font-display text-2xl">Dataset Intake</p>
        <p className="mt-2 text-sm text-muted">Upload files, enrich them with metadata, and register them as first-class datasets.</p>
        <div className="mt-5 space-y-4">
          <Field label="File">
            <Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </Field>
          <Button className="w-full gap-2" onClick={() => uploadMutation.mutate()} disabled={!file || uploadMutation.isPending}>
            <Upload size={16} />
            Stage Upload
          </Button>
          <Field label="Dataset Name">
            <Input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Tags">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delimiter">
              <Input value={delimiter} maxLength={1} onChange={(event) => setDelimiter(event.target.value || ",")} />
            </Field>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-950/20 px-3 py-2 text-sm text-muted">
              <Input
                type="checkbox"
                checked={hasHeader}
                onChange={(event) => setHasHeader(event.target.checked)}
                className="h-4 w-4 rounded border-border bg-slate-950/30 px-0 py-0"
              />
              <span>First row is header</span>
            </label>
          </div>
          <Button className="w-full" onClick={() => registerMutation.mutate()} disabled={!uploadToken || registerMutation.isPending}>
            Register Dataset
          </Button>
          <p className="text-xs text-muted">
            {uploadMutation.error instanceof Error && uploadMutation.error.message}
            {registerMutation.error instanceof Error && registerMutation.error.message}
            {uploadMutation.data && `Staged ${uploadMutation.data.filename} (${uploadMutation.data.detected_format})`}
          </p>
        </div>
      </Card>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl">Dataset Catalog</p>
            <p className="mt-1 text-sm text-muted">Preview, search, and curate datasets that power notebook execution.</p>
          </div>
          <Input placeholder="Search datasets" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-64" />
        </div>
        <div className="mt-5 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dataset) => (
                <tr key={dataset.id} className="border-b border-white/5">
                  <td className="px-3 py-3">
                    <p className="font-medium">{dataset.name}</p>
                    <p className="text-xs text-muted">{dataset.description || "No description"}</p>
                  </td>
                  <td className="px-3 py-3 text-muted">{dataset.source_type}</td>
                  <td className="px-3 py-3 text-muted">{dataset.row_count}</td>
                  <td className="px-3 py-3 text-muted">{dataset.tags.join(", ") || "Unlabeled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
