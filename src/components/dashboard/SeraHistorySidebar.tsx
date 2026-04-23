import React, { useMemo } from 'react';
import { X, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/hooks/useChatSessions';

interface SeraHistorySidebarProps {
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClose: () => void;
}

type Group = { label: string; sessions: ChatSession[] };

const groupSessions = (sessions: ChatSession[]): Group[] => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const today: ChatSession[] = [];
  const yesterday: ChatSession[] = [];
  const previous7: ChatSession[] = [];
  const older: ChatSession[] = [];

  [...sessions]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .forEach((s) => {
      const t = s.timestamp.getTime();
      if (t >= startOfToday) today.push(s);
      else if (t >= startOfYesterday) yesterday.push(s);
      else if (t >= startOf7Days) previous7.push(s);
      else older.push(s);
    });

  return [
    { label: 'Today', sessions: today },
    { label: 'Yesterday', sessions: yesterday },
    { label: 'Previous 7 days', sessions: previous7 },
    { label: 'Older', sessions: older },
  ].filter((g) => g.sessions.length > 0);
};

export const SeraHistorySidebar: React.FC<SeraHistorySidebarProps> = ({
  chatSessions,
  activeSessionId,
  onSessionSelect,
  onDeleteSession,
  onClose,
}) => {
  const groups = useMemo(() => groupSessions(chatSessions), [chatSessions]);

  return (
    <div className="flex h-full w-full flex-col bg-card/40 backdrop-blur">
      {/* Header */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">Chat History</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close history"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground">
            <MessageSquare className="h-6 w-6 mb-2 opacity-60" />
            <p className="text-xs">No previous conversations yet</p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.sessions.map((session) => {
                    const isActive = activeSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        onClick={() => onSessionSelect(session.id)}
                        className={cn(
                          'group relative flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors',
                          isActive
                            ? 'bg-background/60 text-foreground'
                            : 'hover:bg-background/40 text-foreground/90'
                        )}
                      >
                        <div className="min-w-0 flex-1 pr-6">
                          <div className="text-xs font-medium truncate">
                            {session.title || 'New Chat'}
                          </div>
                          {session.lastMessage && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {session.lastMessage}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          aria-label="Delete conversation"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default SeraHistorySidebar;
