import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, right }) => (
  <div className="flex items-end justify-between gap-4 mb-6">
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-glow-primary">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
    {right}
  </div>
);
