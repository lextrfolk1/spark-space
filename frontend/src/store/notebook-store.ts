import { create } from "zustand";
import { api } from "../lib/api";
import {
  BottomPanelTab,
  CellExecuteResponse,
  CellStatus,
  CellType,
  InputType,
  Notebook,
  NotebookCell,
  NotebookListItem,
  NotebookSection,
  NotebookTab,
  PanelVisibility,
} from "../types/domain";

const debounceTimers: Record<string, any> = {};

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

type NotebookState = {
  // Notebook list
  notebooks: NotebookListItem[];
  setNotebooks: (notebooks: NotebookListItem[]) => void;

  // Active notebook
  activeNotebook: Notebook | null;
  setActiveNotebook: (notebook: Notebook | null) => void;

  // Tabs
  openTabs: NotebookTab[];
  activeTabId: string | null;
  openTab: (notebookId: string, name: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Cells
  cells: NotebookCell[];
  setCells: (cells: NotebookCell[]) => void;
  activeCellId: string | null;
  selectCell: (id: string | null) => void;
  addCell: (cellType?: CellType) => Promise<void>;
  updateCell: (id: string, patch: Partial<NotebookCell>) => void;
  deleteCell: (id: string) => Promise<void>;
  duplicateCell: (id: string) => Promise<void>;
  moveCell: (id: string, direction: "up" | "down") => Promise<void>;

  // Sections
  sections: NotebookSection[];
  setSections: (sections: NotebookSection[]) => void;

  // Panels
  panels: PanelVisibility;
  togglePanel: (panel: keyof PanelVisibility) => void;

  // Bottom panel
  bottomPanelTab: BottomPanelTab;
  setBottomPanelTab: (tab: BottomPanelTab) => void;

  // Global search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Execution history for bottom panel
  executionHistory: CellExecuteResponse[];
  addExecutionResult: (result: CellExecuteResponse) => void;

  // Global theme
  theme: "dark-sunset" | "dark-ocean" | "dark-forest" | "light-clean";
  setTheme: (theme: "dark-sunset" | "dark-ocean" | "dark-forest" | "light-clean") => void;
};

// ---------------------------------------------------------------------------
// Cell factory
// ---------------------------------------------------------------------------

const CELL_TYPE_DEFAULTS: Record<CellType, { inputType: InputType; engine: string; content: string }> = {
  SQL: { inputType: "STRUCTURED_QUERY", engine: "spark_sql", content: "SELECT *\nFROM customers\nLIMIT 25;" },
  MARKDOWN: { inputType: "MARKDOWN_TEXT", engine: "markdown", content: "## Section Title\n\nDescribe your analysis here..." },
  DATA_PREVIEW: { inputType: "DATASET_PREVIEW", engine: "dataset_preview", content: "" },
  RESULT: { inputType: "STRUCTURED_QUERY", engine: "spark_sql", content: "" },
  NATURAL_LANGUAGE: { inputType: "USER_INTENT", engine: "spark_sql", content: "" },
  SPARK_SQL: { inputType: "STRUCTURED_QUERY", engine: "spark_sql", content: "SELECT *\nFROM table_name\nLIMIT 25;" },
  PYTHON_DATAFRAME: { inputType: "DATAFRAME_COMMAND", engine: "spark_dataframe", content: "df.select('col1', 'col2').show()" },
  RULE_ENGINE: { inputType: "RULE_DEFINITION", engine: "rule_engine", content: "" },
  API_RESPONSE: { inputType: "API_REQUEST", engine: "spark_sql", content: "" },
  VISUALIZATION: { inputType: "STRUCTURED_QUERY", engine: "spark_sql", content: "" },
  LLM_PROMPT: { inputType: "LLM_PROMPT", engine: "spark_sql", content: "" },
};

function createCell(cellType: CellType = "SQL", order: number = 0): NotebookCell {
  const defaults = CELL_TYPE_DEFAULTS[cellType] ?? CELL_TYPE_DEFAULTS.SQL;
  return {
    id: crypto.randomUUID(),
    cell_type: cellType,
    input_type: defaults.inputType,
    engine: defaults.engine,
    content: defaults.content,
    order,
    status: "idle",
    title: `Cell ${order + 1}`,
    metadata: {},
    collapsed: false,
    datasetIds: [],
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNotebookStore = create<NotebookState>((set, get) => ({
  // Notebook list
  notebooks: [],
  setNotebooks: (notebooks) => set({ notebooks }),

  // Active notebook
  activeNotebook: null,
  setActiveNotebook: (notebook) =>
    set({
      activeNotebook: notebook,
      cells: notebook?.cells ?? [],
      sections: notebook?.sections ?? [],
    }),

  // Tabs
  openTabs: [],
  activeTabId: null,
  openTab: (notebookId, name) => {
    const existing = get().openTabs.find((t) => t.notebookId === notebookId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tab: NotebookTab = { id: crypto.randomUUID(), notebookId, name };
    set((state) => ({
      openTabs: [...state.openTabs, tab],
      activeTabId: tab.id,
    }));
  },
  closeTab: (tabId) =>
    set((state) => {
      const tabs = state.openTabs.filter((t) => t.id !== tabId);
      const newActiveId =
        state.activeTabId === tabId
          ? tabs.length > 0
            ? tabs[tabs.length - 1].id
            : null
          : state.activeTabId;
      return { openTabs: tabs, activeTabId: newActiveId };
    }),
  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  // Cells
  cells: [createCell("SQL", 0)],
  setCells: (cells) => set({ cells }),
  activeCellId: null,
  selectCell: (id) => set({ activeCellId: id }),

  addCell: async (cellType = "SQL") => {
    const activeNotebook = get().activeNotebook;
    if (!activeNotebook) return;
    const defaults = CELL_TYPE_DEFAULTS[cellType] ?? CELL_TYPE_DEFAULTS.SQL;
    try {
      const newCell = await api.createCell(activeNotebook.id, {
        cell_type: cellType,
        input_type: defaults.inputType,
        content: defaults.content,
        engine: defaults.engine,
        order: get().cells.length,
      });
      set((state) => ({
        cells: [...state.cells, newCell],
      }));
    } catch (err) {
      console.error("Failed to create cell on server", err);
      set((state) => ({
        cells: [...state.cells, createCell(cellType, state.cells.length)],
      }));
    }
  },

  updateCell: (id, patch) => {
    set((state) => ({
      cells: state.cells.map((cell) => (cell.id === id ? { ...cell, ...patch } : cell)),
    }));

    const activeNotebook = get().activeNotebook;
    if (!activeNotebook) return;

    const needsSync = 'content' in patch || 'cell_type' in patch || 'input_type' in patch || 'engine' in patch || 'metadata' in patch || 'datasourceId' in patch || 'datasetIds' in patch;
    if (!needsSync) return;

    if (debounceTimers[id]) {
      clearTimeout(debounceTimers[id]);
    }

    debounceTimers[id] = setTimeout(async () => {
      try {
        const updatedCell = get().cells.find((c) => c.id === id);
        if (updatedCell) {
          await api.updateCellOnServer(activeNotebook.id, id, {
            cell_type: updatedCell.cell_type,
            input_type: updatedCell.input_type,
            content: updatedCell.content,
            engine: updatedCell.engine,
            order: updatedCell.order,
            metadata: updatedCell.metadata,
            section_id: updatedCell.section_id,
          });
        }
      } catch (err) {
        console.error("Failed to sync cell update with server", err);
      } finally {
        delete debounceTimers[id];
      }
    }, 1000);
  },

  deleteCell: async (id) => {
    const activeNotebook = get().activeNotebook;
    if (!activeNotebook) return;
    try {
      await api.deleteCellOnServer(activeNotebook.id, id);
      set((state) => ({
        cells: state.cells.length === 1 ? state.cells : state.cells.filter((c) => c.id !== id),
      }));
    } catch (err) {
      console.error("Failed to delete cell on server", err);
      set((state) => ({
        cells: state.cells.length === 1 ? state.cells : state.cells.filter((c) => c.id !== id),
      }));
    }
  },

  duplicateCell: async (id) => {
    const activeNotebook = get().activeNotebook;
    if (!activeNotebook) return;
    const source = get().cells.find((c) => c.id === id);
    if (!source) return;
    try {
      const duplicated = await api.createCell(activeNotebook.id, {
        cell_type: source.cell_type,
        input_type: source.input_type,
        content: source.content,
        engine: source.engine,
        order: get().cells.length,
      });
      set((state) => ({
        cells: [...state.cells, duplicated],
      }));
    } catch (err) {
      console.error("Failed to duplicate cell on server", err);
      set((state) => ({
        cells: [
          ...state.cells,
          {
            ...source,
            id: crypto.randomUUID(),
            title: `${source.title} Copy`,
            status: "idle" as CellStatus,
            result: undefined,
            last_result: undefined,
          },
        ],
      }));
    }
  },

  moveCell: async (id, direction) => {
    const activeNotebook = get().activeNotebook;
    if (!activeNotebook) return;
    const index = get().cells.findIndex((c) => c.id === id);
    if (index < 0) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= get().cells.length) return;
    const cells = [...get().cells];
    [cells[index], cells[nextIndex]] = [cells[nextIndex], cells[index]];
    set({ cells });

    try {
      await Promise.all(
        cells.map((cell, idx) =>
          api.updateCellOnServer(activeNotebook.id, cell.id, { order: idx })
        )
      );
    } catch (err) {
      console.error("Failed to sync cell movement order with server", err);
    }
  },

  // Sections
  sections: [],
  setSections: (sections) => set({ sections }),

  // Panels
  panels: {
    leftSidebar: true,
    rightSidebar: false,
    bottomPanel: false,
  },
  togglePanel: (panel) =>
    set((state) => ({
      panels: { ...state.panels, [panel]: !state.panels[panel] },
    })),

  // Bottom panel
  bottomPanelTab: "logs",
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),

  // Search
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Execution history
  executionHistory: [],
  addExecutionResult: (result) =>
    set((state) => ({
      executionHistory: [result, ...state.executionHistory].slice(0, 100),
    })),

  // Global theme
  theme: (localStorage.getItem("sparkspace-theme") as any) || "light-clean",
  setTheme: (theme) => {
    localStorage.setItem("sparkspace-theme", theme);
    set({ theme });
  },
}));
