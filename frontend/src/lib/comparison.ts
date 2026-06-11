import { NotebookCell } from "../types/domain";

export type DiffRow = {
  type: "matched" | "added" | "removed" | "modified";
  keyVal: string;
  dataA?: Record<string, unknown>;
  dataB?: Record<string, unknown>;
  diffFields?: string[];
};

export type ComparisonResult = {
  schemaDiff: {
    inAOnly: string[];
    inBOnly: string[];
    matched: string[];
  };
  diffRows: DiffRow[];
  colsUnion: string[];
};

export function compareQueryResults(
  cellA: NotebookCell | undefined,
  cellB: NotebookCell | undefined,
  matchKey: string
): ComparisonResult | null {
  if (!cellA || !cellB) return null;

  const rowsA = cellA.result?.rows || [];
  const rowsB = cellB.result?.rows || [];
  if (rowsA.length === 0 || rowsB.length === 0) return null;

  const colsA = Object.keys(rowsA[0]);
  const colsB = Object.keys(rowsB[0]);
  const commonCols = colsA.filter((c) => colsB.includes(c));

  const schemaDiff = {
    inAOnly: colsA.filter((c) => !colsB.includes(c)),
    inBOnly: colsB.filter((c) => !colsA.includes(c)),
    matched: commonCols,
  };

  const diffRows: DiffRow[] = [];

  // Key-based alignment
  if (matchKey && commonCols.includes(matchKey)) {
    const mapA = new Map<string, Record<string, unknown>>();
    rowsA.forEach((r) => {
      const kv = String(r[matchKey] ?? "");
      mapA.set(kv, r);
    });

    const mapB = new Map<string, Record<string, unknown>>();
    rowsB.forEach((r) => {
      const kv = String(r[matchKey] ?? "");
      mapB.set(kv, r);
    });

    const allKeys = Array.from(
      new Set([
        ...rowsA.map((r) => String(r[matchKey] ?? "")),
        ...rowsB.map((r) => String(r[matchKey] ?? "")),
      ])
    );

    allKeys.forEach((kv) => {
      const rA = mapA.get(kv);
      const rB = mapB.get(kv);

      if (rA && !rB) {
        diffRows.push({ type: "removed", keyVal: kv, dataA: rA });
      } else if (!rA && rB) {
        diffRows.push({ type: "added", keyVal: kv, dataB: rB });
      } else if (rA && rB) {
        const diffFields: string[] = [];
        const unionCols = Array.from(new Set([...colsA, ...colsB]));
        unionCols.forEach((col) => {
          if (String(rA[col] ?? "") !== String(rB[col] ?? "")) {
            diffFields.push(col);
          }
        });

        if (diffFields.length > 0) {
          diffRows.push({ type: "modified", keyVal: kv, dataA: rA, dataB: rB, diffFields });
        } else {
          diffRows.push({ type: "matched", keyVal: kv, dataA: rA, dataB: rB });
        }
      }
    });
  } else {
    // Sequential index-based comparison
    const maxLen = Math.max(rowsA.length, rowsB.length);
    for (let i = 0; i < maxLen; i++) {
      const rA = rowsA[i];
      const rB = rowsB[i];

      if (rA && !rB) {
        diffRows.push({ type: "removed", keyVal: String(i), dataA: rA });
      } else if (!rA && rB) {
        diffRows.push({ type: "added", keyVal: String(i), dataB: rB });
      } else if (rA && rB) {
        const diffFields: string[] = [];
        const unionCols = Array.from(new Set([...colsA, ...colsB]));
        unionCols.forEach((col) => {
          if (String(rA[col] ?? "") !== String(rB[col] ?? "")) {
            diffFields.push(col);
          }
        });

        if (diffFields.length > 0) {
          diffRows.push({ type: "modified", keyVal: String(i), dataA: rA, dataB: rB, diffFields });
        } else {
          diffRows.push({ type: "matched", keyVal: String(i), dataA: rA, dataB: rB });
        }
      }
    }
  }

  return {
    schemaDiff,
    diffRows,
    colsUnion: Array.from(new Set([...colsA, ...colsB])),
  };
}
