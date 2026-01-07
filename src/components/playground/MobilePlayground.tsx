import React, { useState } from 'react';
import MonacoEditor from './MonacoEditor';
import Console from './Console';
import GamePreview from './GamePreview';
import MobileToolbar from './MobileToolbar';
import BottomNav from './BottomNav';
import FileTree from './FileTree';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type MobilePanel = 'editor' | 'preview' | 'console';

const MobilePlayground: React.FC = () => {
  const [activePanel, setActivePanel] = useState<MobilePanel>('editor');
  const [filesOpen, setFilesOpen] = useState(false);

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Mobile Toolbar */}
      <MobileToolbar onFilesOpen={() => setFilesOpen(true)} />

      {/* Main content area - shows active panel */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'editor' && <MonacoEditor isMobile />}
        {activePanel === 'preview' && <GamePreview />}
        {activePanel === 'console' && <Console isMobile />}
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
