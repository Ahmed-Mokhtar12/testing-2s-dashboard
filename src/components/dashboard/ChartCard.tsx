import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, className, action }) => {
  return (
    <Card className={cn('bg-card-gradient border border-border/60 shadow-card-soft p-5 animate-fade-in', className)}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="font-display font-semibold text-base">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className="w-full">{children}</div>
    </Card>
  );
};
