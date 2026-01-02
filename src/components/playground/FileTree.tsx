import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Tree, NodeRendererProps, NodeApi, TreeApi } from 'react-arborist';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { ProjectFile } from '@/types/playground';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { cn } from '@/lib/utils';
import useResizeObserver from 'use-resize-observer';
import { Input } from '@/components/ui/input';

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  isFolder: boolean;
  data: ProjectFile;
}

// Convert ProjectFile to TreeNode format for react-arborist
const convertToTreeData = (files: ProjectFile[]): TreeNode[] => {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    children: file.children ? convertToTreeData(file.children) : undefined,
    isFolder: file.isFolder,
    data: file,
  }));
};

// Custom Node Renderer
const Node = ({ node, style, dragHandle }: NodeRendererProps<TreeNode>) => {
  const { openFile, openTabs, activeTabId } = usePlaygroundStore();
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const isActive = activeTab?.fileId === node.data.data.id;
  const isFolder = node.isInternal;

  const getFileIcon = () => {
    if (isFolder) {
      return node.isOpen ? (
        <FolderOpen className="w-4 h-4 text-primary shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-primary shrink-0" />
      );
    }

    const ext = node.data.name.split('.').pop();
    switch (ext) {
      case 'c':
        return <File className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'h':
        return <File className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'Makefile':
        return <File className="w-4 h-4 text-orange-400 shrink-0" />;
      default:
        return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Use arborist's built-in click handler for selection
    node.handleClick(e);
    
    // Open file on click (not folders)
    if (!isFolder) {
      openFile(node.data.data);
    }
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      className={cn(
        'flex items-center gap-1.5 py-1 px-2 cursor-pointer text-sm group',
        'hover:bg-filetree-hover rounded-sm transition-colors duration-75',
        isActive && 'bg-filetree-selected text-primary',
        node.state.isSelected && !isActive && 'bg-accent/50',
        node.state.isFocused && 'ring-1 ring-primary/50',
        node.state.isDragging && 'opacity-50',
        node.state.willReceiveDrop && 'bg-primary/20'
      )}
      onClick={handleClick}
    >
      {/* Folder toggle arrow */}
      {isFolder && (
        <span 
          className="w-4 h-4 flex items-center justify-center shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
        >
          {node.isOpen ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
        </span>
      )}
      {/* Spacer for leaf nodes */}
      {!isFolder && <span className="w-4 shrink-0" />}
      
      {/* File/Folder icon */}
      {getFileIcon()}
      
      {/* Name - supports inline editing */}
      {node.isEditing ? (
        <input
          type="text"
          defaultValue={node.data.name}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => node.reset()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') node.reset();
            if (e.key === 'Enter') node.submit(e.currentTarget.value);
          }}
          autoFocus
          className="flex-1 bg-panel-bg border border-primary rounded px-1 py-0.5 text-sm outline-none"
        />
      ) : (
        <span className="truncate select-none">{node.data.name}</span>
      )}
    </div>
  );
};

const FileTree: React.FC = () => {
  const { currentProject, renameFile, moveFiles, createFile, deleteFiles, openFile } = usePlaygroundStore();
  const { ref, width, height } = useResizeObserver<HTMLDivElement>();
  const treeRef = useRef<TreeApi<TreeNode> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const treeData = useMemo(() => {
    if (!currentProject) return [];
    return convertToTreeData(currentProject.files);
  }, [currentProject]);

  // Rename handler - persists to store
  const handleRename = useCallback(({ id, name }: { id: string; name: string; node: NodeApi<TreeNode> }) => {
    if (name.trim()) {
      renameFile(id, name.trim());
    }
  }, [renameFile]);

  // Move handler - persists to store
  const handleMove = useCallback(({
    dragIds,
    parentId,
    index,
  }: {
    dragIds: string[];
    dragNodes: NodeApi<TreeNode>[];
    parentId: string | null;
    parentNode: NodeApi<TreeNode> | null;
    index: number;
  }) => {
    moveFiles(dragIds, parentId, index);
  }, [moveFiles]);

  // Create handler - persists to store and returns the new node
  const handleCreate = useCallback(({
    parentId,
    index,
    type,
  }: {
    parentId: string | null;
    parentNode: NodeApi<TreeNode> | null;
    index: number;
    type: 'internal' | 'leaf';
  }) => {
    const fileType = type === 'internal' ? 'folder' : 'file';
    const newFile = createFile(parentId, index, fileType);
    if (newFile) {
      return { id: newFile.id, name: newFile.name };
    }
    return null;
  }, [createFile]);

  // Delete handler - persists to store
  const handleDelete = useCallback(({ ids }: { ids: string[]; nodes: NodeApi<TreeNode>[] }) => {
    deleteFiles(ids);
  }, [deleteFiles]);

  // Disallow dropping files into non-folder nodes
  const handleDisableDrop = useCallback(({
    parentNode,
  }: {
    parentNode: NodeApi<TreeNode>;
    dragNodes: NodeApi<TreeNode>[];
    index: number;
  }) => {
    // Allow dropping at root level
    if (!parentNode || parentNode.isRoot) return false;
    // Disallow dropping into non-folders
    if (!parentNode.data.isFolder) return true;
    return false;
  }, []);

  // Activate handler - open file when activated
  const handleActivate = useCallback((node: NodeApi<TreeNode>) => {
    if (!node.isInternal) {
      openFile(node.data.data);
    }
  }, [openFile]);

  // Search match function
  const searchMatch = useCallback((node: NodeApi<TreeNode>, term: string) => {
    return node.data.name.toLowerCase().includes(term.toLowerCase());
  }, []);

  if (!currentProject) {
    return (
      <div className="h-full bg-filetree-bg p-4 text-muted-foreground text-sm">
        No project open
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full bg-filetree-bg flex flex-col overflow-hidden">
      {/* Project header */}
      <div className="p-2 border-b border-panel-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {currentProject.name}
        </span>
      </div>

      {/* Search input */}
      <div className="p-2 border-b border-panel-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 pl-7 text-xs bg-panel-bg border-panel-border"
          />
        </div>
      </div>
      
      {/* Tree container */}
      <div className="flex-1 min-h-0">
        <Tree<TreeNode>
          ref={treeRef}
          data={treeData}
          openByDefault
          width={width || 250}
          height={(height || 400) - 80}
          indent={16}
          rowHeight={28}
          overscanCount={5}
          paddingTop={8}
          paddingBottom={8}
          
          // Enable all interactions
          disableDrag={false}
          disableDrop={handleDisableDrop}
          disableEdit={false}
          disableMultiSelection={false}
          
          // Handlers that persist changes
          onMove={handleMove}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onActivate={handleActivate}
          
          // Search/Filter
          searchTerm={searchTerm}
          searchMatch={searchMatch}
          
          className="focus:outline-none"
          rowClassName="px-1"
        >
          {Node}
        </Tree>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="p-2 border-t border-panel-border text-[10px] text-muted-foreground shrink-0">
        <span className="opacity-70">
          Enter: rename · A: new file · Shift+A: new folder · Delete: remove
        </span>
      </div>
    </div>
  );
};

export default FileTree;
