import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'primary' | 'accent' | 'magenta' | 'success' | 'warning' | 'destructive';
  loading?: boolean;
}

const toneMap = {
  primary: { text: 'text-primary', glow: 'glow-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  accent: { text: 'text-accent', glow: 'glow-accent', bg: 'bg-accent/10', border: 'border-accent/30' },
  magenta: { text: 'text-magenta', glow: 'glow-magenta', bg: 'bg-magenta/10', border: 'border-magenta/30' },
  success: { text: 'text-success', glow: '', bg: 'bg-success/10', border: 'border-success/30' },
  warning: { text: 'text-warning', glow: '', bg: 'bg-warning/10', border: 'border-warning/30' },
  destructive: { text: 'text-destructive', glow: '', bg: 'bg-destructive/10', border: 'border-destructive/30' },
};

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, hint, icon: Icon, tone = 'primary', loading }) => {
  const t = toneMap[tone];
  return (
    <Card className="bg-white text-black border border-black/10 shadow-card-soft p-5 relative overflow-hidden animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/60 font-medium">{label}</p>
          <p className="font-display font-bold text-3xl mt-2 tabular-nums text-black">
            {loading ? '—' : value}
          </p>
          {hint && <p className="text-xs text-black/60 mt-1.5">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center border shrink-0', t.bg, t.border)}>
            <Icon className={cn('h-5 w-5', t.text)} />
          </div>
        )}
      </div>
      <div className={cn('absolute -bottom-8 -right-8 h-24 w-24 rounded-full blur-2xl opacity-30', t.bg)} />
    </Card>
  );
};
