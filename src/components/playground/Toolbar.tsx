import React, { useState, useRef } from 'react';
import { 
  ChevronDown, 
  Hammer, 
  FolderPlus,
  Loader2,
  Play,
  Download,
  Upload,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlaygroundStore } from '@/store/playgroundStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { downloadProject } from '@/lib/storage/projectExport';
import { parseProjectFile, ProjectImportError } from '@/lib/storage/projectImport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ProfileMenu from '@/components/profile/ProfileMenu';

const Toolbar: React.FC = () => {
  const { 
    currentProject, 
    projects, 
    setCurrentProject, 
    createProject,
    deleteProject,
    importProject,
    isBuilding, 
    buildPhase,
    submitBuild,
  } = usePlaygroundStore();
  
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProject(newProjectName.trim());
      setNewProjectName('');
      setShowNewProject(false);
    }
  };

  const handleBuild = () => {
    submitBuild(false);
  };

  const handleBuildAndRun = () => {
    submitBuild(true);
  };

  const handleDeleteProject = async () => {
    if (!currentProject) return;
    await deleteProject(currentProject.id);
    setShowDeleteConfirm(false);
    toast.success('Project deleted');
  };

  const handleExportProject = async () => {
    if (!currentProject) return;
    setIsExporting(true);
    try {
      await downloadProject(currentProject);
      toast.success('Project exported');
    } catch (e) {
      console.error('Export error:', e);
      toast.error('Failed to export project');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const exported = await parseProjectFile(file);
      await importProject(exported.project.name, exported.project.files, exported.excalidrawData);
      toast.success(`Project "${exported.project.name}" imported`);
    } catch (err) {
      if (err instanceof ProjectImportError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to import project');
      }
      console.error('Import error:', err);
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getBuildButtonText = () => {
    if (!isBuilding) return 'Build';
    switch (buildPhase) {
      case 'queued': return 'Queued...';
      case 'compiling': return 'Compiling...';
      case 'linking': return 'Linking...';
      default: return 'Building...';
    }
  };

  return (
    <>
      <div className="h-12 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between px-4">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="CodeForge" className="w-8 h-8 rounded-md" />
            <span className="font-bold text-lg text-[#c9d1d9]">CodeForge</span>
          </div>

          {/* Project selector */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-[#1c2128] text-sm">
              <span className="text-[#c9d1d9]">{currentProject?.name || 'Select Project'}</span>
              <ChevronDown className="w-4 h-4 text-[#8b949e]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-[#161b22] border-[#30363d]">
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => setCurrentProject(project)}
                  className={project.id === currentProject?.id ? 'bg-[#58a6ff]/20 text-[#58a6ff]' : 'text-[#c9d1d9]'}
                >
                  {project.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-[#30363d]" />
              <DropdownMenuItem onClick={() => setShowNewProject(true)} className="text-[#c9d1d9]">
                <FolderPlus className="w-4 h-4 mr-2" />
                New Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImportClick} disabled={isImporting} className="text-[#c9d1d9]">
                <Upload className="w-4 h-4 mr-2" />
                {isImporting ? 'Importing...' : 'Import Project'}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#30363d]" />
              <DropdownMenuItem onClick={handleExportProject} disabled={isExporting || !currentProject} className="text-[#c9d1d9]">
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? 'Exporting...' : 'Export Project'}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowDeleteConfirm(true)} 
                disabled={projects.length <= 1 || !currentProject}
                className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Center section - Build controls */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="default" 
                size="sm" 
                disabled={isBuilding}
                className="gap-2 bg-[#238636] hover:bg-[#2ea043] text-white"
              >
                {isBuilding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Hammer className="w-4 h-4" />
                )}
                {getBuildButtonText()}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="bg-[#161b22] border-[#30363d]">
              <DropdownMenuItem onClick={handleBuild} disabled={isBuilding} className="text-[#c9d1d9]">
                <Hammer className="w-4 h-4 mr-2" />
                Build
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBuildAndRun} disabled={isBuilding} className="text-[#c9d1d9]">
                <Play className="w-4 h-4 mr-2" />
                Build & Run
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Profile / Sign In */}
          <ProfileMenu />
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".codeforge,.json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* New Project Dialog */}
      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent className="bg-[#161b22] border-[#30363d]">
          <DialogHeader>
            <DialogTitle className="text-[#c9d1d9]">Create New Project</DialogTitle>
            <DialogDescription className="text-[#8b949e]">
              Enter a name for your new project.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              autoFocus
              className="bg-[#0d1117] border-[#30363d] text-[#c9d1d9] placeholder:text-[#484f58]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProject(false)} className="border-[#30363d] text-[#c9d1d9] hover:bg-[#1c2128]">
              Cancel
            </Button>
            <Button onClick={handleCreateProject} className="bg-[#238636] hover:bg-[#2ea043] text-white">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-[#161b22] border-[#30363d]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#c9d1d9]">Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8b949e]">
              Are you sure you want to delete "{currentProject?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#30363d] text-[#c9d1d9] hover:bg-[#1c2128] hover:text-[#c9d1d9]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteProject}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Toolbar;
