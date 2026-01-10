import React, { useState } from 'react';
import {
  ChevronDown,
  Hammer,
  FolderPlus,
  Loader2,
} from 'lucide-react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ProfileMenu from '@/components/profile/ProfileMenu';
import BuildProfileSelector from './BuildProfileSelector';

const Toolbar: React.FC = () => {
  const {
    currentProject,
    projects,
    setCurrentProject,
    createProject,
    isBuilding,
    buildPhase,
    submitBuild,
  } = usePlaygroundStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProject(newProjectName.trim());
      setNewProjectName('');
      setShowNewProject(false);
    }
  };

  const handleBuild = () => {
    submitBuild('auto');
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Center section - Build controls */}
        <div className="flex items-center gap-2">
          <BuildProfileSelector />
          <Button
            variant="default"
            size="sm"
            onClick={handleBuild}
            disabled={isBuilding}
            className="gap-2 bg-[#C2D94C] hover:bg-[#B3C443] text-[#0A0E14]"
          >
            {isBuilding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Hammer className="w-4 h-4" />
            )}
            {getBuildButtonText()}
          </Button>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Profile / Sign In */}
          <ProfileMenu />
        </div>
      </div>

      {/* New Project Dialog */}
      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent className="bg-[#161b22] border-[#30363d]">
          <DialogHeader>
            <DialogTitle className="text-[#c9d1d9]">Create New Project</DialogTitle>
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
            <Button onClick={handleCreateProject} className="bg-[#C2D94C] hover:bg-[#B3C443] text-[#0A0E14]">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Toolbar;
