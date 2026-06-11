import Editor from "@monaco-editor/react";
import { useNotebookStore } from "../../../store/notebook-store";

type Props = {
  content: string;
  onChange: (value: string) => void;
};

export function MarkdownCellEditor({ content, onChange }: Props) {
  const { theme } = useNotebookStore();
  const isLight = theme === "light-clean";

  return (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden bg-slate-950">
      <Editor
        height="140px"
        language="markdown"
        theme={isLight ? "light" : "vs-dark"}
        value={content}
        options={{
          minimap: { enabled: false },
          fontSize: 12.5,
          lineNumbers: "on",
          wordWrap: "on",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          scrollbar: { vertical: "visible", horizontal: "auto" },
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: "gutter",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
        }}
        onChange={(value) => onChange(value ?? "")}
      />
    </div>
  );
}
