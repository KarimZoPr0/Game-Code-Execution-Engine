import React, { useEffect, useRef, useState } from 'react';
import Editor, { loader, OnMount } from '@monaco-editor/react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { cn } from '@/lib/utils';

// Define Ayu Dark theme
loader.init().then((monaco) => {
  monaco.editor.defineTheme('ayu-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '626A73', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'FF8F40' },
      { token: 'string', foreground: 'C2D94C' },
      { token: 'number', foreground: 'FFEE99' },
      { token: 'regexp', foreground: '95E6CB' },
      { token: 'type', foreground: 'FFB454' },
      { token: 'class', foreground: 'FFB454' },
      { token: 'function', foreground: 'FFB454' },
      { token: 'identifier', foreground: 'B3B1AD' },
      { token: 'variable', foreground: 'B3B1AD' },
      { token: 'constant', foreground: 'FFEE99' },
      { token: 'operator', foreground: 'F29668' },
      { token: 'delimiter', foreground: 'B3B1AD' },
      { token: 'tag', foreground: '59C2FF' },
      { token: 'attribute.name', foreground: 'FFB454' },
      { token: 'attribute.value', foreground: 'C2D94C' },
      { token: 'macro', foreground: 'F07178' },
      { token: 'entity', foreground: '59C2FF' },
    ],
    colors: {
      // Editor colors
      'editor.background': '#0A0E14',
      'editor.foreground': '#B3B1AD',
      'editor.lineHighlightBackground': '#131721',
      'editor.selectionBackground': '#253340',
      'editor.inactiveSelectionBackground': '#1B2733',
      'editor.selectionHighlightBackground': '#1B2733',
      'editor.wordHighlightBackground': '#1B273380',
      'editor.wordHighlightStrongBackground': '#25334080',
      'editor.findMatchBackground': '#FFB45480',
      'editor.findMatchHighlightBackground': '#FFB45440',
      'editor.findRangeHighlightBackground': '#1B273340',
      'editor.hoverHighlightBackground': '#1B273340',
      'editor.rangeHighlightBackground': '#1B273340',

      // Cursor
      'editorCursor.foreground': '#FF8F40',

      // Line numbers
      'editorLineNumber.foreground': '#3E4B59',
      'editorLineNumber.activeForeground': '#6C7A88',

      // Indent guides
      'editorIndentGuide.background': '#1B2733',
      'editorIndentGuide.activeBackground': '#253340',

      // Whitespace
      'editorWhitespace.foreground': '#1B2733',

      // Widgets
      'editorWidget.background': '#0D1016',
      'editorWidget.border': '#1B2733',
      'editorWidget.resizeBorder': '#59C2FF',

      // Suggest widget
      'editorSuggestWidget.background': '#0D1016',
      'editorSuggestWidget.border': '#1B2733',
      'editorSuggestWidget.foreground': '#B3B1AD',
      'editorSuggestWidget.selectedBackground': '#253340',
      'editorSuggestWidget.highlightForeground': '#FF8F40',

      // Hover widget
      'editorHoverWidget.background': '#0D1016',
      'editorHoverWidget.border': '#1B2733',

      // Scrollbar
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#3E4B5933',
      'scrollbarSlider.hoverBackground': '#3E4B5966',
      'scrollbarSlider.activeBackground': '#3E4B5999',

      // Brackets
      'editorBracketMatch.background': '#25334080',
      'editorBracketMatch.border': '#59C2FF',

      // Gutter
      'editorGutter.background': '#0A0E14',
      'editorGutter.modifiedBackground': '#59C2FF',
      'editorGutter.addedBackground': '#C2D94C',
      'editorGutter.deletedBackground': '#F07178',
    },
  });
});

interface MonacoEditorProps {
  isMobile?: boolean;
}

// Media file detection
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'];

const isImageFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
};

const isAudioFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return AUDIO_EXTENSIONS.includes(ext);
};

const getMediaMimeType = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Media Preview Component
const MediaPreview: React.FC<{ fileName: string; content: string; isBase64?: boolean }> = ({ fileName, content, isBase64 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isImage = isImageFile(fileName);
  const isAudio = isAudioFile(fileName);
  const mimeType = getMediaMimeType(fileName);

  // For base64 content, create data URL
  const dataUrl = isBase64 ? `data:${mimeType};base64,${content}` : content;

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  if (isImage) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0A0E14] p-4">
        <div className="flex flex-col items-center gap-4">
          <img
            src={dataUrl}
            alt={fileName}
            className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
          />
          <p className="text-[#6C7A88] text-sm">{fileName}</p>
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0A0E14] p-4">
        <div className="flex flex-col items-center gap-4">
          <p className="text-[#B3B1AD] font-medium">{fileName}</p>
          <audio
            src={dataUrl}
            controls
            className="w-full max-w-md"
          />
        </div>
      </div>
    );
  }

  return null;
};

const MonacoEditor: React.FC<MonacoEditorProps> = ({ isMobile = false }) => {
  const { openTabs, activeTabId, setActiveTab, updateFileContent, closeTab } = usePlaygroundStore();
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
      <div className="h-full bg-[#0A0E14] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No file open</p>
          <p className="text-sm">Select a file from the tree to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0A0E14]">
      {/* Tab bar */}
      <div className="flex bg-[#0D1016] border-b border-[#1B2733] overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-[#1B2733] min-w-fit group",
              "text-sm font-medium transition-colors",
              tab.id === activeTabId
                ? "bg-[#0A0E14] text-[#B3B1AD] border-b-2 border-b-[#FF8F40]"
                : "text-[#6C7A88] hover:text-[#B3B1AD] hover:bg-[#141925]"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={cn(tab.isDirty && "italic")}>
              {tab.fileName}
              {tab.isDirty && <span className="text-[#FF8F40] ml-1">●</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="p-0.5 rounded hover:bg-[#253340] opacity-60 hover:opacity-100 transition-opacity"
              title="Close tab"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Editor or Media Preview */}
      <div className="flex-1 overflow-hidden">
        {activeTab && (isImageFile(activeTab.fileName) || isAudioFile(activeTab.fileName)) ? (
          <MediaPreview
            fileName={activeTab.fileName}
            content={activeTab.content}
            isBase64={activeTab.isBase64}
          />
        ) : activeTab && (
          <Editor
            height="100%"
            language={getLanguage(activeTab.language)}
            value={activeTab.content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme="ayu-dark"
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
