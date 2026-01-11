import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Tree, NodeRendererProps, NodeApi, TreeApi } from 'react-arborist';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Search, Plus, Trash2, Edit2, FolderPlus } from 'lucide-react';
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

// Custom Node Renderer - needs access to onFileSelect callback via context
const FileTreeContext = React.createContext<{
  onFileSelect?: () => void;
  onDeleteNode?: (id: string) => void;
  onRenameNode?: (id: string) => void;
  onExternalDrop?: (folderId: string | null, files: DataTransfer) => void;
  externalDragOver?: string | null;
  setExternalDragOver?: (id: string | null) => void;
}>({});

const Node = ({ node, style, dragHandle }: NodeRendererProps<TreeNode>) => {
  const { openFile, openTabs, activeTabId, ensureEditorVisible } = usePlaygroundStore();
  const { onFileSelect, onDeleteNode, onExternalDrop, externalDragOver, setExternalDragOver } = React.useContext(FileTreeContext);
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const isActive = activeTab?.fileId === node.data.data.id;
  const isFolder = node.isInternal;
  const isExternalDropTarget = externalDragOver === node.id;

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
    // For files: if not already selected, just select it (shows edit/delete buttons)
    // If already selected, then open it
    if (!isFolder) {
      if (!node.state.isSelected) {
        // First click: just select
        node.handleClick(e);
      } else {
        // Second click/already selected: open the file
        ensureEditorVisible();
        openFile(node.data.data);
        // Notify parent (for mobile sheet close)
        onFileSelect?.();
      }
    } else {
      // For folders: use default behavior (toggle open/close)
      node.handleClick(e);
    }
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.edit();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteNode?.(node.id);
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
        node.state.willReceiveDrop && 'bg-primary/20',
        isExternalDropTarget && 'ring-2 ring-primary bg-primary/20'
      )}
      onClick={handleClick}
      onDragOver={(e) => {
        // Handle external file drops on folders
        if (isFolder && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setExternalDragOver?.(node.id);
        }
      }}
      onDragLeave={(e) => {
        if (isFolder && externalDragOver === node.id) {
          setExternalDragOver?.(null);
        }
      }}
      onDrop={(e) => {
        if (isFolder && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setExternalDragOver?.(null);
          onExternalDrop?.(node.id, e.dataTransfer);
        }
      }}
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
        <>
          <span className="truncate select-none flex-1">{node.data.name}</span>
          {/* Action buttons - visible on hover or when selected (for touch/mobile) */}
          <div className={cn(
            "items-center gap-0.5 shrink-0",
            node.state.isSelected ? "flex" : "hidden group-hover:flex"
          )}>
            <button
              onClick={handleRenameClick}
              className="p-1 hover:bg-accent active:bg-accent rounded transition-colors"
              title="Rename"
            >
              <Edit2 className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-1 hover:bg-destructive/20 active:bg-destructive/20 rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

interface FileTreeProps {
  onFileSelect?: () => void;
}

const FileTree: React.FC<FileTreeProps> = ({ onFileSelect }) => {
  const { currentProject, renameFile, moveFiles, createFile, deleteFiles, openFile, ensureEditorVisible, addFiles, addFolders } = usePlaygroundStore();
  const { ref, width, height } = useResizeObserver<HTMLDivElement>();
  const treeRef = useRef<TreeApi<TreeNode> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [externalDragOver, setExternalDragOver] = useState<string | null>(null);

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
      ensureEditorVisible();
      openFile(node.data.data);
      onFileSelect?.();
    }
  }, [openFile, ensureEditorVisible, onFileSelect]);

  // Search match function
  const searchMatch = useCallback((node: NodeApi<TreeNode>, term: string) => {
    return node.data.name.toLowerCase().includes(term.toLowerCase());
  }, []);

  // Handle external file drop (for dropping external files into specific folders)
  const handleExternalDrop = useCallback(async (parentId: string | null, dataTransfer: DataTransfer) => {
    // Binary file extensions
    const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'wav', 'mp3', 'ogg', 'wasm', 'bin', 'dat'];

    // Helper to read a file entry
    const readFileEntry = (entry: FileSystemFileEntry): Promise<{ name: string; content: string; isBase64?: boolean }> => {
      return new Promise((resolve, reject) => {
        entry.file((file) => {
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const isBinary = binaryExts.includes(ext);

          if (isBinary) {
            const reader = new FileReader();
            reader.onload = () => {
              // Result is "data:mime/type;base64,XXXX" - extract just the base64 part
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(',')[1];
              resolve({ name: file.name, content: base64, isBase64: true });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          } else {
            file.text()
              .then(text => resolve({ name: file.name, content: text }))
              .catch(reject);
          }
        }, reject);
      });
    };

    // Helper to recursively read directory
    const readDirectory = async (entry: FileSystemDirectoryEntry): Promise<ProjectFile[]> => {
      const results: ProjectFile[] = [];
      const reader = entry.createReader();

      const entries = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(resolve);
      });

      for (const child of entries) {
        if (child.isFile) {
          const fileData = await readFileEntry(child as FileSystemFileEntry);
          results.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: fileData.name,
            content: fileData.content,
            language: fileData.name.split('.').pop() || 'text',
            isFolder: false,
            isBase64: fileData.isBase64,
          });
        } else if (child.isDirectory) {
          const children = await readDirectory(child as FileSystemDirectoryEntry);
          results.push({
            id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: child.name,
            content: '',
            language: '',
            isFolder: true,
            children,
          });
        }
      }

      return results;
    };

    // Use dataTransfer.items for folder support
    const items = dataTransfer.items;
    const filesToAdd: { name: string; content: string; isBase64?: boolean }[] = [];
    const foldersToAdd: ProjectFile[] = [];

    for (const item of Array.from(items)) {
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;

      if (entry.isFile) {
        const fileData = await readFileEntry(entry as FileSystemFileEntry);
        filesToAdd.push(fileData);
      } else if (entry.isDirectory) {
        const folderFiles = await readDirectory(entry as FileSystemDirectoryEntry);
        foldersToAdd.push({
          id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: entry.name,
          content: '',
          language: '',
          isFolder: true,
          children: folderFiles,
        });
      }
    }

    // Add files and folders to the specified parent
    if (filesToAdd.length > 0) {
      addFiles(filesToAdd, parentId);
    }
    if (foldersToAdd.length > 0) {
      addFolders(foldersToAdd, parentId);
    }
  }, [addFiles, addFolders]);

  if (!currentProject) {
    return (
      <div className="h-full bg-filetree-bg p-4 text-muted-foreground text-sm">
        No project open
      </div>
    );
  }

  return (
    <FileTreeContext.Provider value={{
      onFileSelect,
      onDeleteNode: (id: string) => deleteFiles([id]),
      onExternalDrop: handleExternalDrop,
      externalDragOver,
      setExternalDragOver,
    }}>
      <div
        ref={ref}
        className="h-full bg-filetree-bg flex flex-col overflow-hidden"
        onDragOver={(e) => {
          // Allow external file drops at root level
          if (e.dataTransfer.types.includes('Files') && !externalDragOver) {
            e.preventDefault();
            e.currentTarget.classList.add('ring-2', 'ring-primary');
          }
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove('ring-2', 'ring-primary');
        }}
        onDrop={(e) => {
          // Only handle if not dropping on a folder
          if (e.dataTransfer.types.includes('Files') && !externalDragOver) {
            e.preventDefault();
            e.currentTarget.classList.remove('ring-2', 'ring-primary');
            handleExternalDrop(null, e.dataTransfer);
          }
        }}
      >
        {/* Project header with action buttons */}
        <div className="p-2 border-b border-panel-border shrink-0 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {currentProject.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const newFile = createFile(null, 0, 'file');
                if (newFile && treeRef.current) {
                  // Start editing the new file name
                  setTimeout(() => {
                    treeRef.current?.get(newFile.id)?.edit();
                  }, 50);
                }
              }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="New File"
            >
              <Plus className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={() => {
                const newFolder = createFile(null, 0, 'folder');
                if (newFolder && treeRef.current) {
                  // Start editing the new folder name
                  setTimeout(() => {
                    treeRef.current?.get(newFolder.id)?.edit();
                  }, 50);
                }
              }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
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
    </FileTreeContext.Provider>
  );
};

export default FileTree;
