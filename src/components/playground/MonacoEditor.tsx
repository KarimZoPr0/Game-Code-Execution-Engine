import React from "react";
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
      {/* Tabs */}
      <div className="flex bg-panel-header border-b border-panel-border overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-panel-border min-w-fit text-sm font-medium",
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
            theme="gruvbox-dark"
            beforeMount={(m: typeof monaco) => {
              m.editor.defineTheme("gruvbox-dark", {
                base: "vs-dark",
                inherit: true,
                rules: [
                  { token: "comment", foreground: "928374", fontStyle: "italic" },
                  { token: "string", foreground: "B8BB26" },
                  { token: "number", foreground: "D3869B" },
                  { token: "keyword", foreground: "FB4934" },
                  { token: "type", foreground: "FABD2F" },
                  { token: "operator", foreground: "FE8019" },
                  { token: "identifier", foreground: "EBDBB2" },
                ],
                colors: {
                  "editor.background": "#282828",
                  "editor.foreground": "#EBDBB2",
                  "editorLineNumber.foreground": "#665C54",
                  "editorLineNumber.activeForeground": "#FABD2F",

                  "editor.selectionBackground": "#3C3836",
                  "editor.inactiveSelectionBackground": "#32302F",
                  "editor.lineHighlightBackground": "#32302F",

                  "editorCursor.foreground": "#EBDBB2",

                  "editorWhitespace.foreground": "#504945",
                  "editorIndentGuide.background": "#504945",
                  "editorIndentGuide.activeBackground": "#665C54",

                  "editorBracketMatch.background": "#3C3836",
                  "editorBracketMatch.border": "#FABD2F",

                  "minimap.background": "#1D2021",
                },
              });
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
              cursorBlinking: "smooth",
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
