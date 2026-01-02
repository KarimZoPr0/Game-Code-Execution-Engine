import React, { useRef, useMemo } from 'react';
import { Tree, NodeRendererProps, NodeApi } from 'react-arborist';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { ProjectFile } from '@/types/playground';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { cn } from '@/lib/utils';
import useResizeObserver from 'use-resize-observer';

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  data: ProjectFile;
}

// Convert ProjectFile to TreeNode format for react-arborist
const convertToTreeData = (files: ProjectFile[]): TreeNode[] => {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    children: file.children ? convertToTreeData(file.children) : undefined,
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

  const handleClick = () => {
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
  const { currentProject } = usePlaygroundStore();
  const { ref, width, height } = useResizeObserver<HTMLDivElement>();
  const treeRef = useRef<any>(null);

  const treeData = useMemo(() => {
    if (!currentProject) return [];
    return convertToTreeData(currentProject.files);
  }, [currentProject]);

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
      
      {/* Tree container */}
      <div className="flex-1 min-h-0">
        <Tree<TreeNode>
          ref={treeRef}
          data={treeData}
          openByDefault
          width={width || 250}
          height={(height || 400) - 40}
          indent={16}
          rowHeight={28}
          overscanCount={5}
          paddingTop={8}
          paddingBottom={8}
          disableDrag={false}
          disableDrop={false}
          disableEdit={false}
          onMove={({ dragIds, parentId, index }) => {
            console.log('Move:', dragIds, 'to', parentId, 'at', index);
            // TODO: Implement file move in store
          }}
          onRename={({ id, name }) => {
            console.log('Rename:', id, 'to', name);
            // TODO: Implement file rename in store
          }}
          onDelete={({ ids }) => {
            console.log('Delete:', ids);
            // TODO: Implement file delete in store
          }}
          onCreate={({ parentId, index, type }) => {
            console.log('Create:', type, 'in', parentId, 'at', index);
            // TODO: Implement file/folder creation in store
            return null;
          }}
          className="focus:outline-none"
          rowClassName="px-1"
        >
          {Node}
        </Tree>
      </div>
    </div>
  );
};

export default FileTree;
