import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogIn, LogOut, User, Settings } from 'lucide-react';
import ProfileSettings from './ProfileSettings';

const ProfileMenu: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => navigate('/auth')}
      >
        <LogIn className="w-4 h-4" />
        Sign In
      </Button>
    );
  }

  const displayName = profile?.username || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="w-8 h-8">
              <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Profile Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileSettings open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
};

export default ProfileMenu;
