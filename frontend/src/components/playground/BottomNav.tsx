import React from 'react';
import { Code2, Play, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MobilePanel } from './MobilePlayground';

interface BottomNavProps {
  activePanel: MobilePanel;
  onChange: (panel: MobilePanel) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activePanel, onChange }) => {
  const navItems: { id: MobilePanel; icon: React.ReactNode; label: string }[] = [
    { id: 'editor', icon: <Code2 className="w-5 h-5" />, label: 'Editor' },
    { id: 'preview', icon: <Play className="w-5 h-5" />, label: 'Preview' },
    { id: 'console', icon: <Terminal className="w-5 h-5" />, label: 'Console' },
  ];

  return (
    <nav className="h-16 bg-[#161b22] border-t border-[#30363d] flex items-center justify-around shrink-0 safe-area-pb">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-2 px-4 min-w-[72px] rounded-lg transition-colors',
            activePanel === item.id
              ? 'text-[#58a6ff] bg-[#58a6ff]/10'
              : 'text-[#8b949e] hover:text-[#c9d1d9]'
          )}
        >
          {item.icon}
          <span className="text-xs font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
