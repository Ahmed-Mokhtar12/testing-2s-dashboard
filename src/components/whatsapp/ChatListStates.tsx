import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Shared list states for both sidebars (desktop + mobile).

export const ChatListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="px-3 py-2" data-testid="chat-list-skeleton">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-1 py-2.5">
        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    ))}
  </div>
);

export const ChatListError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
    <p className="text-sm text-[#667781]">Couldn't load conversations.</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-1.5 rounded-full bg-[#008069] text-white text-sm hover:bg-[#017561] transition-colors"
      >
        Retry
      </button>
    )}
  </div>
);
