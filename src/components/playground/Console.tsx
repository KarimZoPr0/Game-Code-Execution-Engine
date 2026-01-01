import React, { useRef, useEffect } from 'react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { Trash2, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

const Console: React.FC = () => {
  const { consoleMessages, clearConsole } = usePlaygroundStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [consoleMessages]);

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'success':
        return 'text-success';
      default:
        return 'text-foreground';
    }
  };

  const getMessagePrefix = (type: string) => {
    switch (type) {
      case 'error':
        return '[ERROR]';
      case 'warning':
        return '[WARN]';
      case 'success':
        return '[OK]';
      default:
        return '[INFO]';
    }
  };

  return (
    <div className="h-full flex flex-col bg-console-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span>Console</span>
        </div>
        <button
          onClick={clearConsole}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          title="Clear console"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-sm">
        {consoleMessages.length === 0 ? (
          <div className="text-muted-foreground">No output</div>
        ) : (
          consoleMessages.map((msg) => (
            <div key={msg.id} className="flex gap-2 py-0.5">
              <span className="text-muted-foreground text-xs shrink-0">
                {msg.timestamp.toLocaleTimeString()}
              </span>
              <span className={cn("font-semibold shrink-0", getMessageColor(msg.type))}>
                {getMessagePrefix(msg.type)}
              </span>
              <span className={getMessageColor(msg.type)}>{msg.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-panel-border">
        <span className="px-3 text-primary font-mono">$</span>
        <input
          type="text"
          placeholder="Type a command..."
          className="flex-1 bg-transparent py-2 pr-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const input = e.currentTarget.value.trim();
              if (input) {
                usePlaygroundStore.getState().addConsoleMessage('info', `> ${input}`);
                e.currentTarget.value = '';
              }
            }
          }}
        />
      </div>
    </div>
  );
};

export default Console;
