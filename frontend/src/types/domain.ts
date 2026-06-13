// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type CellType =
  | "SQL"
  | "MARKDOWN"
  | "DATA_PREVIEW"
  | "RESULT"
  | "NATURAL_LANGUAGE"
  | "SPARK_SQL"
  | "PYTHON_DATAFRAME"
  | "RULE_ENGINE"
  | "API_RESPONSE"
  | "VISUALIZATION"
  | "LLM_PROMPT";

export type InputType =
  | "STRUCTURED_QUERY"
  | "MARKDOWN_TEXT"
  | "DATASET_PREVIEW"
  | "USER_INTENT"
  | "DATAFRAME_COMMAND"
  | "RULE_DEFINITION"
  | "API_REQUEST"
  | "LLM_PROMPT";

export type ResultType =
  | "TABLE"
  | "CHART"
  | "JSON"
  | "TEXT"
  | "FILE"
  | "ERROR"
  | "EXECUTION_PLAN"
  | "DATA_PROFILE";

export type CellStatus = "idle" | "running" | "completed" | "failed";

// ---------------------------------------------------------------------------
// Notebook domain
// ---------------------------------------------------------------------------

export type Notebook = {
  id: string;
  name: string;
  description?: string | null;
  is_archived: boolean;
  sections: NotebookSection[];
  cells: NotebookCell[];
  created_at: string;
  updated_at: string;
};

export type NotebookListItem = {
  id: string;
  name: string;
  description?: string | null;
  is_archived: boolean;
  cell_count: number;
  created_at: string;
  updated_at: string;
};

export type NotebookSection = {
  id: string;
  notebook_id: string;
  title: string;
  order: number;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Cell domain
// ---------------------------------------------------------------------------

export type NotebookCell = {
  id: string;
  notebook_id?: string;
  section_id?: string | null;
  cell_type: CellType;
  input_type: InputType;
  engine: "spark_sql" | "spark_dataframe" | "rule_engine" | string;
  content: string;
  order: number;
  status: CellStatus;
  title: string;
  durationMs?: number;
  result?: ExecutionResult;
  last_result?: CellExecuteResponse | null;
  metadata: Record<string, unknown>;
  collapsed: boolean;

  // Legacy compat
  datasourceId?: string;
  datasetIds: string[];
};

// ---------------------------------------------------------------------------
// Cell execution DTO contract
// ---------------------------------------------------------------------------

export type CellExecuteRequest = {
  cellType: CellType;
  inputType: InputType;
  content: string;
  context: Record<string, unknown>;
};

export type CellExecuteResponse = {
  execution_id: string;
  status: string;
  execution_type: string;
  result_type: ResultType;
  generated_query?: string | null;
  columns: string[];
  schema: Array<Record<string, unknown>>;
  rows: Array<Record<string, unknown>>;
  row_count: number;
  metadata: Record<string, unknown>;
  logs: string[];
  warnings: string[];
  error?: any | null;
};

// ---------------------------------------------------------------------------
// Datasource / Dataset / Execution
// ---------------------------------------------------------------------------

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

// Legacy execution types (kept for backward compat with old workspace)
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
  error?: any | null;
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

// ---------------------------------------------------------------------------
// UI State types
// ---------------------------------------------------------------------------

export type NotebookTab = {
  id: string;
  notebookId: string;
  name: string;
};

export type PanelVisibility = {
  leftSidebar: boolean;
  rightSidebar: boolean;
  bottomPanel: boolean;
};

export type BottomPanelTab = "results" | "logs" | "history" | "execution-plan";
