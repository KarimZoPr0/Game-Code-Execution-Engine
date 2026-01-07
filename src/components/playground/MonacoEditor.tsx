import React, { useEffect, useRef } from 'react';
import Editor, { loader, OnMount } from '@monaco-editor/react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { cn } from '@/lib/utils';

// Define custom theme before component mounts
loader.init().then((monaco) => {
  monaco.editor.defineTheme('codeforge-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b2266',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#58a6ff',
      'editorLineNumber.foreground': '#484f58',
      'editorLineNumber.activeForeground': '#c9d1d9',
      'editor.inactiveSelectionBackground': '#264f7855',
      'editorIndentGuide.background': '#21262d',
      'editorIndentGuide.activeBackground': '#30363d',
      'editorWidget.background': '#161b22',
      'editorWidget.border': '#30363d',
      'editorSuggestWidget.background': '#161b22',
      'editorSuggestWidget.border': '#30363d',
      'editorSuggestWidget.selectedBackground': '#264f78',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#484f5833',
      'scrollbarSlider.hoverBackground': '#484f5866',
      'scrollbarSlider.activeBackground': '#484f5899',
    },
  });
});

interface MonacoEditorProps {
  isMobile?: boolean;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({ isMobile = false }) => {
  const { openTabs, activeTabId, setActiveTab, updateFileContent } = usePlaygroundStore();
  const editorRef = useRef<unknown>(null);

  const activeTab = openTabs.find((tab) => tab.id === activeTabId);

  const handleEditorChange = (value: string | undefined) => {
    if (activeTabId && value !== undefined) {
      updateFileContent(activeTabId, value);
    }
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const getLanguage = (lang: string) => {
    switch (lang) {
      case 'c':
      case 'h':
        return 'c';
      case 'cpp':
      case 'cc':
      case 'hpp':
        return 'cpp';
      case 'makefile':
        return 'makefile';
      case 'json':
        return 'json';
      default:
        return 'plaintext';
    }
  };

  if (openTabs.length === 0) {
    return (
      <div className="h-full bg-[#0d1117] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No file open</p>
          <p className="text-sm">Select a file from the tree to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Tab bar */}
      <div className="flex bg-[#161b22] border-b border-[#30363d] overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-[#30363d] min-w-fit",
              "text-sm font-medium transition-colors",
              tab.id === activeTabId
                ? "bg-[#0d1117] text-[#c9d1d9] border-b-2 border-b-[#58a6ff]"
                : "text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1c2128]"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={cn(tab.isDirty && "italic")}>
              {tab.fileName}
              {tab.isDirty && <span className="text-[#58a6ff] ml-1">●</span>}
            </span>
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
            onMount={handleEditorMount}
            theme="codeforge-dark"
            options={{
              minimap: { enabled: !isMobile, scale: 1, showSlider: 'mouseover' },
              fontSize: isMobile ? 16 : 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontLigatures: !isMobile,
              lineNumbers: isMobile ? 'off' : 'on',
              renderWhitespace: 'selection',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              wordWrap: isMobile ? 'on' : 'off',
              padding: { top: isMobile ? 8 : 16, bottom: isMobile ? 8 : 16 },
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              bracketPairColorization: { enabled: true },
              guides: {
                bracketPairs: !isMobile,
                indentation: !isMobile,
              },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: 'auto',
                horizontal: isMobile ? 'hidden' : 'auto',
                verticalScrollbarSize: isMobile ? 8 : 10,
                horizontalScrollbarSize: 10,
              },
              folding: !isMobile,
              glyphMargin: !isMobile,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MonacoEditor;
