import React, { useEffect } from "react";
import Editor from "@monaco-editor/react";
import { usePlaygroundStore } from "@/store/playgroundStore";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type * as monaco from "monaco-editor";

const MonacoEditor: React.FC = () => {
  const { openTabs, activeTabId, setActiveTab, closeTab, updateFileContent } = usePlaygroundStore();

  const activeTab = openTabs.find((tab) => tab.id === activeTabId);

  const handleEditorChange = (value: string | undefined) => {
    if (activeTabId && value !== undefined) {
      updateFileContent(activeTabId, value);
    }
  };

  const getLanguage = (lang: string) => {
    switch (lang) {
      case "c":
      case "h":
        return "c";
      case "makefile":
        return "makefile";
      default:
        return "plaintext";
    }
  };

  // A nicer dark theme than vs-dark: "Tokyo Night"-ish
  useEffect(() => {
    // define a tiny guard so we only register once per page-load
    // (monaco is global-ish; defining again is harmless but noisy in some setups)
    (window as any).__MONACO_TOKYO_NIGHT_DEFINED__ = (window as any).__MONACO_TOKYO_NIGHT_DEFINED__ ?? false;
  }, []);

  if (openTabs.length === 0) {
    return (
      <div className="h-full bg-editor-bg flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No file open</p>
          <p className="text-sm">Select a file from the tree to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-editor-bg">
      {/* Tab bar */}
      <div className="flex bg-panel-header border-b border-panel-border overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-panel-border min-w-fit",
              "text-sm font-medium",
              tab.id === activeTabId
                ? "bg-editor-bg text-foreground border-b-2 border-b-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={cn(tab.isDirty && "italic")}>
              {tab.fileName}
              {tab.isDirty && <span className="text-primary ml-1">•</span>}
            </span>
            <button
              className="p-0.5 hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {activeTab && (
          <Editor
            height="100%"
            language={getLanguage(activeTab.language)}
            value={activeTab.content}
            onChange={handleEditorChange}
            theme="tokyo-night"
            beforeMount={(m: typeof monaco) => {
              // Define a nicer theme once
              if ((window as any).__MONACO_TOKYO_NIGHT_DEFINED__) return;

              m.editor.defineTheme("tokyo-night", {
                base: "vs-dark",
                inherit: true,
                rules: [
                  { token: "comment", foreground: "565F89", fontStyle: "italic" },
                  { token: "string", foreground: "9ECE6A" },
                  { token: "number", foreground: "FF9E64" },
                  { token: "keyword", foreground: "7AA2F7" },
                  { token: "type", foreground: "2AC3DE" },
                  { token: "delimiter", foreground: "A9B1D6" },
                  { token: "operator", foreground: "89DDFF" },
                  { token: "identifier", foreground: "C0CAF5" },
                ],
                colors: {
                  // editor
                  "editor.background": "#1A1B26",
                  "editor.foreground": "#C0CAF5",
                  "editorLineNumber.foreground": "#3B4261",
                  "editorLineNumber.activeForeground": "#A9B1D6",

                  // selection + highlight
                  "editor.selectionBackground": "#33467C",
                  "editor.inactiveSelectionBackground": "#2A2E3F",
                  "editor.selectionHighlightBackground": "#2F3C70",
                  "editor.wordHighlightBackground": "#2F3C70",
                  "editor.wordHighlightStrongBackground": "#3D59A1",

                  // current line
                  "editor.lineHighlightBackground": "#1F2335",

                  // cursor
                  "editorCursor.foreground": "#C0CAF5",

                  // whitespace / indent guides
                  "editorWhitespace.foreground": "#2A2E3F",
                  "editorIndentGuide.background": "#2A2E3F",
                  "editorIndentGuide.activeBackground": "#3B4261",

                  // find
                  "editor.findMatchBackground": "#3D59A1",
                  "editor.findMatchHighlightBackground": "#2F3C70",

                  // brackets
                  "editorBracketMatch.background": "#2F3C70",
                  "editorBracketMatch.border": "#3D59A1",

                  // minimap
                  "minimap.background": "#16161E",

                  // scrollbar
                  "scrollbarSlider.background": "#2A2E3FAA",
                  "scrollbarSlider.hoverBackground": "#3B4261AA",
                  "scrollbarSlider.activeBackground": "#414868AA",
                },
              });

              (window as any).__MONACO_TOKYO_NIGHT_DEFINED__ = true;
            }}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              lineNumbers: "on",
              renderWhitespace: "selection",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              wordWrap: "off",
              padding: { top: 16 },
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              smoothScrolling: false,
              // a couple tasteful usability tweaks
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true },
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MonacoEditor;
