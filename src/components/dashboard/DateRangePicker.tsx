import React, { useState } from 'react';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDateRange, type DateRangePreset } from '@/contexts/DateRangeContext';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

const presets: { value: DateRangePreset; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
];

export const DateRangePicker: React.FC = () => {
  const { preset, setPreset, setCustom, from, to, label } = useDateRange();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from, to });

  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex items-center gap-1 p-1 rounded-lg border border-border bg-card/50">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              preset === p.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'h-9 gap-2 border-border bg-card/50 hover:bg-card font-normal',
              preset === 'custom' && 'border-primary/40 text-primary'
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            <span className="text-sm tabular-nums">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(r) => {
              setRange(r);
              if (r?.from && r?.to) {
                setCustom(r.from, r.to);
                setOpen(false);
              }
            }}
            numberOfMonths={2}
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
