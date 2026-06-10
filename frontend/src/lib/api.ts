import {
  Datasource,
  DatasourceDraft,
  Dataset,
  DatasetPreview,
  ExecutionHistoryItem,
  ExecutionRequest,
  ExecutionResult,
  LogEntry,
  UploadResult,
} from "../types/domain";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  listDatasets: () => request<Dataset[]>("/api/datasets"),
  getDatasetPreview: (datasetId: string) => request<DatasetPreview>(`/api/datasets/${datasetId}/preview`),
  uploadDataset: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/api/datasets/upload`, { method: "POST", body: formData });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as UploadResult;
  },
  registerDataset: (payload: {
    upload_token: string;
    dataset_name: string;
    description: string;
    tags: string[];
    delimiter: string;
    has_header: boolean;
    infer_schema: boolean;
  }) =>
    request<Dataset>("/api/datasets/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteDataset: (datasetId: string) =>
    request<void>(`/api/datasets/${datasetId}`, {
      method: "DELETE",
    }),
  listDatasources: () => request<Datasource[]>("/api/datasources"),
  createDatasource: (payload: DatasourceDraft) =>
    request<Datasource>("/api/datasources", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateDatasource: (datasourceId: string, payload: DatasourceDraft) =>
    request<Datasource>(`/api/datasources/${datasourceId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testDatasource: (payload: DatasourceDraft) =>
    request<{ success: boolean; message: string }>("/api/datasources/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteDatasource: (datasourceId: string) =>
    request<void>(`/api/datasources/${datasourceId}`, {
      method: "DELETE",
    }),
  execute: (payload: ExecutionRequest) =>
    request<ExecutionResult>("/api/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listExecutionHistory: () => request<ExecutionHistoryItem[]>("/api/executions/history"),
  listLogs: () => request<LogEntry[]>("/api/logs"),
};
