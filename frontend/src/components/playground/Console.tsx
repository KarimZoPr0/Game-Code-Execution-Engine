import React, { useRef, useEffect, useState } from 'react';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { Trash2, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

type LogFilter = 'all' | 'console' | 'build';

interface ConsoleProps {
  isMobile?: boolean;
}

const Console: React.FC<ConsoleProps> = ({ isMobile = false }) => {
  const { consoleMessages, clearConsole, buildLogs, clearBuildLogs } = usePlaygroundStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LogFilter>('all');

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [consoleMessages, buildLogs]);

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'error':
      case 'stderr':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'success':
        return 'text-success';
      case 'status':
        return 'text-primary';
      default:
        return 'text-foreground';
    }
  };

  const getMessagePrefix = (type: string) => {
    switch (type) {
      case 'error':
      case 'stderr':
        return '[ERROR]';
      case 'warning':
        return '[WARN]';
      case 'success':
        return '[OK]';
      case 'status':
        return '[BUILD]';
      case 'stdout':
        return '[BUILD]';
      default:
        return '[INFO]';
    }
  };

  const handleClear = () => {
    clearConsole();
    clearBuildLogs();
  };

  // Combine and sort all messages
  const allMessages = [
    ...consoleMessages.map((msg) => ({
      id: msg.id,
      type: msg.type,
      message: msg.message,
      timestamp: msg.timestamp,
      source: 'console' as const,
    })),
    ...buildLogs.map((log) => ({
      id: log.id,
      type: log.type,
      message: log.message,
      timestamp: log.timestamp,
      source: 'build' as const,
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const filteredMessages = allMessages.filter((msg) => {
    if (filter === 'all') return true;
    return msg.source === filter;
  });

  return (
    <div className="h-full flex flex-col bg-console-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Console</span>
          {/* Filter tabs */}
          <div className={cn("flex text-xs", isMobile ? "ml-1" : "ml-2")}>
            {(['all', 'console', 'build'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded capitalize',
                  isMobile ? 'px-3 py-1.5' : 'px-2 py-0.5',
                  filter === f 
                    ? 'bg-primary/20 text-primary' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleClear}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          title="Clear console"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-sm">
        {filteredMessages.length === 0 ? (
          <div className="text-muted-foreground">No output</div>
        ) : (
          filteredMessages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-2", isMobile ? "py-1" : "py-0.5")}>
              {!isMobile && (
                <span className="text-muted-foreground text-xs shrink-0">
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              )}
              <span className={cn("font-semibold shrink-0", getMessageColor(msg.type))}>
                {getMessagePrefix(msg.type)}
              </span>
              <span className={cn(getMessageColor(msg.type), "break-all")}>{msg.message}</span>
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
