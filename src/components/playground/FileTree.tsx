import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { ProjectFile } from '@/types/playground';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { cn } from '@/lib/utils';

interface FileTreeItemProps {
  file: ProjectFile;
  level: number;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ file, level }) => {
  const [isOpen, setIsOpen] = useState(true);
  const { openFile, openTabs, activeTabId } = usePlaygroundStore();

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const isActive = activeTab?.fileId === file.id;

  const handleClick = () => {
    if (file.isFolder) {
      setIsOpen(!isOpen);
    } else {
      openFile(file);
    }
  };

  const getFileIcon = () => {
    if (file.isFolder) {
      return isOpen ? (
        <FolderOpen className="w-4 h-4 text-primary" />
      ) : (
        <Folder className="w-4 h-4 text-primary" />
      );
    }
    
    const ext = file.name.split('.').pop();
    switch (ext) {
      case 'c':
      case 'h':
        return <File className="w-4 h-4 text-blue-400" />;
      case 'Makefile':
        return <File className="w-4 h-4 text-orange-400" />;
      default:
        return <File className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 cursor-pointer text-sm",
          "hover:bg-filetree-hover rounded-sm",
          isActive && "bg-filetree-selected text-primary"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {file.isFolder && (
          <span className="w-4 h-4 flex items-center justify-center">
            {isOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
        {!file.isFolder && <span className="w-4" />}
        {getFileIcon()}
        <span className="truncate">{file.name}</span>
      </div>
      {file.isFolder && isOpen && file.children && (
        <div>
          {file.children.map((child) => (
            <FileTreeItem key={child.id} file={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC = () => {
  const { currentProject } = usePlaygroundStore();

  if (!currentProject) {
    return (
      <div className="h-full bg-filetree-bg p-4 text-muted-foreground text-sm">
        No project open
      </div>
    );
  }

  return (
    <div className="h-full bg-filetree-bg overflow-auto">
      <div className="p-2 border-b border-panel-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {currentProject.name}
        </span>
      </div>
      <div className="py-1">
        {currentProject.files.map((file) => (
          <FileTreeItem key={file.id} file={file} level={0} />
        ))}
      </div>
    </div>
  );
};

export default FileTree;
