import React, { useState } from 'react';
import {
  Menu,
  Hammer,
  Loader2,
  FolderOpen,
  FolderPlus,
  ChevronRight,
} from 'lucide-react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

interface MobileToolbarProps {
  onFilesOpen: () => void;
}

const MobileToolbar: React.FC<MobileToolbarProps> = ({ onFilesOpen }) => {
  const {
    currentProject,
    projects,
    setCurrentProject,
    createProject,
    isBuilding,
    buildPhase,
    submitBuild,
  } = usePlaygroundStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProject(newProjectName.trim());
      setNewProjectName('');
      setShowNewProject(false);
      setMenuOpen(false);
    }
  };

  const handleBuild = () => {
    submitBuild('auto');
  };

  const getBuildIcon = () => {
    if (isBuilding) {
      return <Loader2 className="w-5 h-5 animate-spin" />;
    }
    return <Hammer className="w-5 h-5" />;
  };

  return (
    <>
      <div className="h-14 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between px-3 shrink-0">
        {/* Left section - Menu */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded-lg hover:bg-[#1c2128] text-[#c9d1d9]"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Files button */}
          <button
            onClick={onFilesOpen}
            className="p-2 rounded-lg hover:bg-[#1c2128] text-[#c9d1d9]"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
        </div>

        {/* Center - Project Name */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[#c9d1d9] max-w-[150px] truncate">
            {currentProject?.name || 'Select Project'}
          </span>
        </div>

        {/* Right section - Build Profile + Build + User Profile */}
        <div className="flex items-center gap-2">
          <BuildProfileSelector />
          <button
            onClick={handleBuild}
            disabled={isBuilding}
            className="p-2 rounded-lg bg-[#C2D94C] hover:bg-[#B3C443] text-[#0A0E14] disabled:opacity-50"
          >
            {getBuildIcon()}
          </button>
          <ProfileMenu />
        </div>
      </div>

      {/* Menu Sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[280px] p-0 bg-[#161b22] border-[#30363d]">
          <SheetHeader className="px-4 py-4 border-b border-[#30363d]">
            <SheetTitle className="text-[#c9d1d9]">
              Menu
            </SheetTitle>
          </SheetHeader>

          <div className="py-2">
            {/* Projects section */}
            <div className="px-4 py-2">
              <p className="text-xs text-[#8b949e] uppercase tracking-wider mb-2">Projects</p>
            </div>

            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  setCurrentProject(project);
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left ${project.id === currentProject?.id
                  ? 'bg-[#58a6ff]/20 text-[#58a6ff]'
                  : 'text-[#c9d1d9] hover:bg-[#1c2128]'
                  }`}
              >
                <span className="truncate">{project.name}</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            ))}

            <button
              onClick={() => setShowNewProject(true)}
              className="w-full flex items-center gap-2 px-4 py-3 text-[#c9d1d9] hover:bg-[#1c2128]"
            >
              <FolderPlus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* New Project Dialog */}
      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent className="bg-[#161b22] border-[#30363d] max-w-[90vw]">
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
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNewProject(false)}
              className="flex-1 border-[#30363d] text-[#c9d1d9] hover:bg-[#1c2128]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              className="flex-1 bg-[#C2D94C] hover:bg-[#B3C443] text-[#0A0E14]"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MobileToolbar;
