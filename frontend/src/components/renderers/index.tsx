import { type CellExecuteResponse, type ExecutionResult, type ResultType } from "../../types/domain";
import { TableRenderer } from "./TableRenderer";
import { JsonRenderer } from "./JsonRenderer";
import { ErrorRenderer } from "./ErrorRenderer";
import { TextRenderer } from "./TextRenderer";
import { LogRenderer } from "./LogRenderer";
import { SchemaRenderer } from "./SchemaRenderer";

export type RendererProps = {
  result: CellExecuteResponse | ExecutionResult;
  className?: string;
};

/**
 * ResultRendererFactory — selects the appropriate renderer component
 * based on the resultType from the backend response.
 *
 * To add a new renderer:
 * 1. Create a new component in this directory
 * 2. Register it in the RENDERERS map below
 */
const RENDERERS: Record<string, React.ComponentType<RendererProps>> = {
  TABLE: TableRenderer,
  JSON: JsonRenderer,
  ERROR: ErrorRenderer,
  TEXT: TextRenderer,
  EXECUTION_PLAN: JsonRenderer,
  DATA_PROFILE: TableRenderer,
};

export function getRenderer(resultType: ResultType | string): React.ComponentType<RendererProps> {
  return RENDERERS[resultType] || TableRenderer;
}

export function ResultRenderer({ result, resultType, className }: {
  result: CellExecuteResponse | ExecutionResult;
  resultType?: ResultType | string;
  className?: string;
}) {
  const type = resultType || (result as CellExecuteResponse).result_type || "TABLE";
  const Component = getRenderer(type);
  return <Component result={result} className={className} />;
}

export { TableRenderer, JsonRenderer, ErrorRenderer, TextRenderer, LogRenderer, SchemaRenderer };
