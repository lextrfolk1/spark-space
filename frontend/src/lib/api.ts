import {
  CellExecuteRequest,
  CellExecuteResponse,
  Datasource,
  DatasourceDraft,
  Dataset,
  DatasetPreview,
  ExecutionHistoryItem,
  ExecutionRequest,
  ExecutionResult,
  LogEntry,
  Notebook,
  NotebookCell,
  NotebookListItem,
  NotebookSection,
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
  // ---------------------------------------------------------------------------
  // Notebooks
  // ---------------------------------------------------------------------------
  listNotebooks: () => request<NotebookListItem[]>("/api/notebooks"),

  createNotebook: (payload: { name: string; description?: string }) =>
    request<Notebook>("/api/notebooks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getNotebook: (notebookId: string) =>
    request<Notebook>(`/api/notebooks/${notebookId}`),

  updateNotebook: (notebookId: string, payload: { name?: string; description?: string; is_archived?: boolean }) =>
    request<Notebook>(`/api/notebooks/${notebookId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteNotebook: (notebookId: string) =>
    request<void>(`/api/notebooks/${notebookId}`, {
      method: "DELETE",
    }),

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------
  createSection: (notebookId: string, payload: { title?: string; order?: number }) =>
    request<NotebookSection>(`/api/notebooks/${notebookId}/sections`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSection: (notebookId: string, sectionId: string, payload: { title?: string; order?: number; collapsed?: boolean }) =>
    request<NotebookSection>(`/api/notebooks/${notebookId}/sections/${sectionId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteSection: (notebookId: string, sectionId: string) =>
    request<void>(`/api/notebooks/${notebookId}/sections/${sectionId}`, {
      method: "DELETE",
    }),

  // ---------------------------------------------------------------------------
  // Cells
  // ---------------------------------------------------------------------------
  createCell: (notebookId: string, payload: { cell_type?: string; input_type?: string; content?: string; engine?: string; section_id?: string; order?: number; metadata?: Record<string, any> }) =>
    request<NotebookCell>(`/api/notebooks/${notebookId}/cells`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCellOnServer: (notebookId: string, cellId: string, payload: Partial<NotebookCell>) =>
    request<NotebookCell>(`/api/notebooks/${notebookId}/cells/${cellId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteCellOnServer: (notebookId: string, cellId: string) =>
    request<void>(`/api/notebooks/${notebookId}/cells/${cellId}`, {
      method: "DELETE",
    }),

  // ---------------------------------------------------------------------------
  // Cell Execution — the core contract-based endpoint
  // ---------------------------------------------------------------------------
  executeCell: (notebookId: string, cellId: string, payload: CellExecuteRequest) =>
    request<CellExecuteResponse>(`/api/notebooks/${notebookId}/cells/${cellId}/execute`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---------------------------------------------------------------------------
  // Datasets
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Datasources
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Legacy execute (backward compat with old workspace)
  // ---------------------------------------------------------------------------
  execute: (payload: ExecutionRequest) =>
    request<ExecutionResult>("/api/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---------------------------------------------------------------------------
  // History & Logs
  // ---------------------------------------------------------------------------
  listExecutionHistory: () => request<ExecutionHistoryItem[]>("/api/executions/history"),
  listLogs: () => request<LogEntry[]>("/api/logs"),
};
