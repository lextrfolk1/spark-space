import { create } from "zustand";
import { NotebookCell } from "../types/domain";

type WorkspaceState = {
  cells: NotebookCell[];
  activeCellId: string | null;
  selectCell: (id: string) => void;
  addCell: () => void;
  updateCell: (id: string, patch: Partial<NotebookCell>) => void;
  deleteCell: (id: string) => void;
  duplicateCell: (id: string) => void;
  moveCell: (id: string, direction: "up" | "down") => void;
};

const createCell = (seed = 1): NotebookCell => ({
  id: crypto.randomUUID(),
  title: `Cell ${seed}`,
  engine: "spark_sql",
  datasetIds: [],
  datasourceId: undefined,
  content: `SELECT *\nFROM customers\nLIMIT 25;`,
  status: "idle",
  collapsed: false,
});

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  cells: [createCell()],
  activeCellId: null,
  selectCell: (id) => set({ activeCellId: id }),
  addCell: () =>
    set((state) => ({
      cells: [...state.cells, createCell(state.cells.length + 1)],
    })),
  updateCell: (id, patch) =>
    set((state) => ({
      cells: state.cells.map((cell) => (cell.id === id ? { ...cell, ...patch } : cell)),
    })),
  deleteCell: (id) =>
    set((state) => ({
      cells: state.cells.length === 1 ? state.cells : state.cells.filter((cell) => cell.id !== id),
    })),
  duplicateCell: (id) =>
    set((state) => {
      const current = state.cells.find((cell) => cell.id === id);
      if (!current) return state;
      return {
        cells: [
          ...state.cells,
          {
            ...current,
            id: crypto.randomUUID(),
            title: `${current.title} Copy`,
            status: "idle",
          },
        ],
      };
    }),
  moveCell: (id, direction) =>
    set((state) => {
      const index = state.cells.findIndex((cell) => cell.id === id);
      if (index < 0) return state;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= state.cells.length) return state;
      const cells = [...state.cells];
      [cells[index], cells[nextIndex]] = [cells[nextIndex], cells[index]];
      return { cells };
    }),
}));

