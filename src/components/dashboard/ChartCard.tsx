import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /** Fill parent height: card becomes a min-h-0 flex column and the chart
      body flexes, so ResponsiveContainer height="100%" works inside it. */
  fill?: boolean;
  /** The query behind this chart failed. Charts are fed `data?.trend || []`,
      so a failure renders empty axes that read as "no activity in this range"
      — indistinguishable from a genuinely quiet period. Replaces the chart
      body with an explicit failure note instead. */
  error?: boolean;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, className, action, fill, error }) => {
  return (
    <Card
      className={cn(
        'bg-card-gradient border border-border/60 shadow-card-soft animate-fade-in',
        fill ? 'p-5 short:p-4' : 'p-5',
        fill && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      <div className={cn('flex items-start justify-between gap-3', fill ? 'mb-4 short:mb-2' : 'mb-4', fill && 'shrink-0')}>
        <div>
          <h3 className="font-display font-semibold text-base">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div
        className={cn('w-full', fill && 'min-h-0 flex-1', error && 'flex items-center justify-center')}
        data-chart-state={error ? 'error' : 'ready'}
      >
        {error ? (
          <p className="text-sm text-destructive text-center px-4 py-8">
            Couldn&apos;t load this chart. An empty chart here would look like a quiet period.
          </p>
        ) : (
          children
        )}
      </div>
    </Card>
  );
};
