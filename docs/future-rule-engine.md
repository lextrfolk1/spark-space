# Future Rule Engine Guide

The UI already targets a generic execution contract:

- Editor content is plain command text
- Engine choice is explicit per cell
- Results render through a normalized response model

## Intended Future Flow

```text
Editor
 -> Rule Parser
 -> Rule AST
 -> Execution Planner
 -> Rule Executor
 -> Spark
```

## Planned Extension Points

- Replace `PassthroughParser` with syntax-aware parsers by engine
- Introduce engine-specific AST types and a shared planning interface
- Expand `RuleEngineExecutor` to consume planner output instead of raw command text
- Add Monaco language configuration for rule syntax without changing notebook layout

## Why This Matters

The notebook UI never assumes Spark SQL-specific concepts beyond the current engine label. That separation keeps the editor stable while backend execution semantics evolve.

