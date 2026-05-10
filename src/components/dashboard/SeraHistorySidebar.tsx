import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
type VirtualRow =
  | { type: 'group'; key: string; label: string }
  | { type: 'session'; key: string; session: ChatSession };

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
    .forEach((session) => {
      const timestamp = session.timestamp.getTime();
      if (timestamp >= startOfToday) today.push(session);
      else if (timestamp >= startOfYesterday) yesterday.push(session);
      else if (timestamp >= startOf7Days) previous7.push(session);
      else older.push(session);
    });

  return [
    { label: 'Today', sessions: today },
    { label: 'Yesterday', sessions: yesterday },
    { label: 'Previous 7 days', sessions: previous7 },
    { label: 'Older', sessions: older },
  ].filter((group) => group.sessions.length > 0);
};

export const SeraHistorySidebar: React.FC<SeraHistorySidebarProps> = ({
  chatSessions,
  activeSessionId,
  onSessionSelect,
  onDeleteSession,
  onClose,
}) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(() => groupSessions(chatSessions), [chatSessions]);
  const rows = useMemo<VirtualRow[]>(
    () =>
      groups.flatMap((group) => [
        { type: 'group', key: `group-${group.label}`, label: group.label } as const,
        ...group.sessions.map((session) => ({
          type: 'session',
          key: session.id,
          session,
        }) as const),
      ]),
    [groups]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === 'group' ? 28 : 56),
    overscan: 6,
  });

  return (
    <div className="flex h-full w-full flex-col bg-card/40 backdrop-blur">
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">Chat History</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close history"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground">
            <MessageSquare className="h-6 w-6 mb-2 opacity-60" />
            <p className="text-xs">No previous conversations yet</p>
          </div>
        ) : (
          <div ref={parentRef} className="h-full overflow-y-auto">
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

                return (
                  <div
                    key={row.key}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.type === 'group' ? (
                      <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {row.label}
                      </div>
                    ) : (
                      <div
                        onClick={() => onSessionSelect(row.session.id)}
                        className={cn(
                          'group relative flex items-center gap-2 rounded-md mx-2 px-2 py-2 cursor-pointer transition-colors',
                          activeSessionId === row.session.id
                            ? 'bg-background/60 text-foreground'
                            : 'hover:bg-background/40 text-foreground/90'
                        )}
                      >
                        <div className="min-w-0 flex-1 pr-6">
                          <div className="text-xs font-medium truncate">
                            {row.session.title || 'New Chat'}
                          </div>
                          {row.session.lastMessage && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {row.session.lastMessage}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteSession(row.session.id);
                          }}
                          aria-label="Delete conversation"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-2.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default SeraHistorySidebar;
