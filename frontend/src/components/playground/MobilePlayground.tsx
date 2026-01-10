import React, { useState } from 'react';
import MonacoEditor from './MonacoEditor';
import Console from './Console';
import GamePreview from './GamePreview';
import MobileToolbar from './MobileToolbar';
import BottomNav from './BottomNav';
import FileTree from './FileTree';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type MobilePanel = 'editor' | 'preview' | 'console';

interface PreviewPanel {
  id: string;
  name: string;
}

const MobilePlayground: React.FC = () => {
  const [activePanel, setActivePanel] = useState<MobilePanel>('editor');
  const [filesOpen, setFilesOpen] = useState(false);
  const [previewPanels, setPreviewPanels] = useState<PreviewPanel[]>([
    { id: 'preview-1', name: 'Preview 1' }
  ]);
  const [activePreviewId, setActivePreviewId] = useState('preview-1');

  const handleAddPreview = () => {
    const newId = `preview-${Date.now()}`;
    const newPanel = { id: newId, name: `Preview ${previewPanels.length + 1}` };
    setPreviewPanels([...previewPanels, newPanel]);
    setActivePreviewId(newId);
    setActivePanel('preview');
  };

  const handleRemovePreview = (id: string) => {
    if (previewPanels.length === 1) return; // Keep at least one preview
    const filtered = previewPanels.filter(p => p.id !== id);
    setPreviewPanels(filtered);
    if (activePreviewId === id && filtered.length > 0) {
      setActivePreviewId(filtered[0].id);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Mobile Toolbar */}
      <MobileToolbar onFilesOpen={() => setFilesOpen(true)} />

      {/* Main content area - shows active panel, keep others mounted but hidden */}
      <div className="flex-1 overflow-hidden relative">
        <div className={activePanel === 'editor' ? 'h-full' : 'hidden'}>
          <MonacoEditor isMobile />
        </div>

        {/* Preview area with tabs when multiple previews */}
        <div className={activePanel === 'preview' ? 'h-full flex flex-col' : 'hidden'}>
          {/* Preview tabs - only shown when multiple previews exist */}
          {previewPanels.length > 1 && (
            <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/30 overflow-x-auto shrink-0">
              {previewPanels.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePreviewId(p.id)}
                  className={`px-3 py-1 text-xs rounded whitespace-nowrap ${activePreviewId === p.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                >
                  {p.name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePreview(p.id);
                    }}
                    className="ml-2 text-xs opacity-70 hover:opacity-100"
                  >
                    ×
                  </button>
                </button>
              ))}
            </div>
          )}

          {/* All preview panels - each gets its own GamePreview instance with mobile add handler */}
          {previewPanels.map((panel) => (
            <div
              key={panel.id}
              className={activePreviewId === panel.id ? 'flex-1 overflow-hidden' : 'hidden'}
            >
              <GamePreview onAddPreview={handleAddPreview} />
            </div>
          ))}
        </div>

        <div className={activePanel === 'console' ? 'h-full' : 'hidden'}>
          <Console isMobile />
        </div>
      </div>

      {/* Bottom navigation */}
      <BottomNav activePanel={activePanel} onChange={setActivePanel} />

      {/* File tree sheet */}
      <Sheet open={filesOpen} onOpenChange={setFilesOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 bg-[#0d1117] border-[#30363d]">
          <SheetHeader className="px-4 py-3 border-b border-[#30363d]">
            <SheetTitle className="text-[#c9d1d9]">Files</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-60px)] overflow-hidden">
            <FileTree onFileSelect={() => setFilesOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobilePlayground;
