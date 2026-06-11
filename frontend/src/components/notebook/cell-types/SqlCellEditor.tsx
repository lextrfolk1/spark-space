import { useRef } from "react";
import Editor from "@monaco-editor/react";
import { useNotebookStore } from "../../../store/notebook-store";

type Props = {
  content: string;
  language?: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onEditorMount?: (editor: any) => void;
};

export function SqlCellEditor({ content, language = "sql", onChange, onRun, onEditorMount }: Props) {
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const { theme } = useNotebookStore();
  const isLight = theme === "light-clean";

  return (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden bg-slate-950">
      <Editor
        height="140px"
        language={language}
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
        onMount={(editor, monaco) => {
          onEditorMount?.(editor);
          editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => runRef.current());
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
          editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter, () => runRef.current());
        }}
        onChange={(value) => onChange(value ?? "")}
      />
    </div>
  );
}
