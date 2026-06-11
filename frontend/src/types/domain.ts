export type Datasource = {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database?: string | null;
  schema_name?: string | null;
  username?: string | null;
  jdbc_url?: string | null;
  metadata: Record<string, unknown>;
  runtime_managed: boolean;
  has_password: boolean;
  created_at?: string;
};

export type DatasourceDraft = {
  name: string;
  type: string;
  host: string;
  port: number;
  database?: string;
  schema_name?: string;
  username?: string;
  password?: string;
  jdbc_url?: string;
  metadata: Record<string, unknown>;
};

export type Dataset = {
  id: string;
  name: string;
  description?: string | null;
  tags: string[];
  source_type: string;
  source_id?: string | null;
  schema: Array<{ name: string; type: string }>;
  metadata: Record<string, unknown>;
  location: string;
  created_by: string;
  created_at?: string;
  row_count: number;
};

export type DatasetPreview = {
  dataset_id: string;
  rows: Array<Record<string, unknown>>;
  schema: Array<{ name: string; type: string }>;
  row_count: number;
};

export type UploadResult = {
  upload_token: string;
  filename: string;
  content_type?: string;
  bytes_written: number;
  detected_format: string;
};

export type NotebookCell = {
  id: string;
  title: string;
  engine: "spark_sql" | "spark_dataframe" | "rule_engine";
  datasourceId?: string;
  datasetIds: string[];
  content: string;
  status: "idle" | "running" | "completed" | "failed";
  durationMs?: number;
  result?: ExecutionResult;
  collapsed: boolean;
};

export type ExecutionRequest = {
  engine: string;
  datasource_id?: string;
  dataset_ids: string[];
  command: string;
  execution_mode: "selected_text" | "current_cell" | "full_notebook";
  timeout_ms?: number;
  limit?: number;
  context: Record<string, unknown>;
};

export type ExecutionResult = {
  execution_id: string;
  status: string;
  schema: Array<Record<string, unknown>>;
  rows: Array<Record<string, unknown>>;
  row_count: number;
  dataframe_metadata: Record<string, unknown>;
  logs: string[];
  warnings: string[];
  error?: string | null;
  execution_time_ms: number;
  statistics: Record<string, unknown>;
  dataset_ids?: string[];
};

export type ExecutionHistoryItem = {
  id: string;
  engine: string;
  dataset_id?: string | null;
  datasource_id?: string | null;
  user_name: string;
  command: string;
  status: string;
  duration_ms: number;
  created_at: string;
};

export type LogEntry = {
  timestamp: string;
  level: string;
  source: string;
  message: string;
};

