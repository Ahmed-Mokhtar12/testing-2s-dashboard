import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, right }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6 shrink-0">
    <div className="min-w-0">
      <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-glow-primary">{title}</h1>
      {subtitle && <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {right}
  </div>
);
