import React, { useState } from 'react';
import { 
  ChevronDown, 
  Hammer, 
  Plus, 
  Settings, 
  Users,
  FolderPlus,
  Zap
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
import { BuildTarget } from '@/types/playground';

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
    startBuild,
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

  const handleBuild = (target: BuildTarget) => {
    startBuild(target);
  };

  return (
    <>
      <div className="h-12 bg-panel-header border-b border-panel-border flex items-center justify-between px-4">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="default" 
                size="sm" 
                disabled={isBuilding}
                className="gap-2"
              >
                <Hammer className="w-4 h-4" />
                {isBuilding ? 'Building...' : 'Build'}
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBuild('all')}>
                <span className="font-medium">Build All</span>
                <span className="ml-auto text-xs text-muted-foreground">⌘B</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBuild('game')}>
                <span>Build Game</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBuild('main')}>
                <span>Build Main</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
