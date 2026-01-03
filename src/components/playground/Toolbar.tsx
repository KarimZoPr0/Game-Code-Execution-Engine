import React, { useState } from 'react';
import { 
  ChevronDown, 
  Hammer, 
  Plus, 
  Settings, 
  Users,
  FolderPlus,
  Loader2
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

interface ToolbarProps {
  onAddPanel: (type: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ onAddPanel }) => {
  const { 
    currentProject, 
    projects, 
    setCurrentProject, 
    createProject, 
    isBuilding, 
    buildPhase,
    submitBuild,
    collaborators 
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
    submitBuild();
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
      <div className="h-12 bg-panel-header border-b border-panel-border flex items-center justify-between px-4">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="CodeForge" className="w-8 h-8 rounded-md" />
            <span className="font-bold text-lg text-foreground">CodeForge</span>
          </div>

          {/* Project selector */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted text-sm">
              <span className="text-foreground">{currentProject?.name || 'Select Project'}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => setCurrentProject(project)}
                  className={project.id === currentProject?.id ? 'bg-primary/20 text-primary' : ''}
                >
                  {project.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowNewProject(true)}>
                <FolderPlus className="w-4 h-4 mr-2" />
                New Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Center section - Build controls */}
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            size="sm" 
            disabled={isBuilding}
            onClick={handleBuild}
            className="gap-2"
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
          {/* Add panel */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Panel
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAddPanel('editor')}>
                Text Editor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddPanel('preview')}>
                Game Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddPanel('console')}>
                Console
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddPanel('filetree')}>
                File Tree
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddPanel('tldraw')}>
                Drawing Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Collaborators */}
          <div className="flex items-center gap-1">
            <div className="flex -space-x-2">
              {collaborators.slice(0, 3).map((collab) => (
                <div
                  key={collab.id}
                  className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: collab.color }}
                  title={collab.name}
                >
                  {collab.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {collaborators.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{collaborators.length - 3}
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" className="ml-1">
              <Users className="w-4 h-4" />
            </Button>
          </div>

          {/* Settings */}
          <Button variant="ghost" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* New Project Dialog */}
      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProject(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Toolbar;
