import React, { useState } from 'react';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type DateRangePreset } from '@/contexts/date-range-context';
import { useDateRange } from '@/contexts/useDateRange';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import { parseISO } from 'date-fns';
import { dubaiDateKey } from '@/utils/timezone';

const presets: { value: DateRangePreset; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
];

type MobilePreset = {
  key: string;
  label: string;
  onSelect: () => void;
  isActive: boolean;
};

export const DateRangePicker: React.FC = () => {
  const { preset, setPreset, setCustom, from, to, label } = useDateRange();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from, to });

  // Dubai calendar day as a local wall-clock Date (labels/comparisons only) — the old
  // getDubaiNow() double-shifted on non-+4 browsers (audit A4, Codex review).
  const todayKey = dubaiDateKey(new Date());
  const today = parseISO(todayKey);
  const startOfMonth = parseISO(`${todayKey.slice(0, 7)}-01`);

  const mobilePresets: MobilePreset[] = [
    {
      key: 'today',
      label: 'Today',
      onSelect: () => setCustom(today, today),
      isActive:
        preset === 'custom' &&
        from.toDateString() === today.toDateString() &&
        to.toDateString() === today.toDateString(),
    },
    {
      key: 'last7',
      label: '7D',
      onSelect: () => setPreset('last7'),
      isActive: preset === 'last7',
    },
    {
      key: 'last30',
      label: '30D',
      onSelect: () => setPreset('last30'),
      isActive: preset === 'last30',
    },
    {
      key: 'thisMonth',
      label: 'This Month',
      onSelect: () => setCustom(startOfMonth, today),
      isActive:
        preset === 'custom' &&
        from.toDateString() === startOfMonth.toDateString() &&
        to.toDateString() === today.toDateString(),
    },
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex md:hidden overflow-x-auto gap-1 pb-1">
        {mobilePresets.map((mobilePreset) => (
          <button
            key={mobilePreset.key}
            onClick={mobilePreset.onSelect}
            className={cn(
              'shrink-0 px-3 py-2 text-xs font-medium rounded-md border transition-colors',
              mobilePreset.isActive
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'text-muted-foreground border-border bg-card/50 hover:text-foreground hover:bg-muted/50'
            )}
          >
            {mobilePreset.label}
          </button>
        ))}
      </div>

      <div className="hidden md:flex items-center gap-1 p-1 rounded-lg border border-border bg-card/50">
        {presets.map((currentPreset) => (
          <button
            key={currentPreset.value}
            onClick={() => setPreset(currentPreset.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              preset === currentPreset.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {currentPreset.label}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'h-9 w-full sm:w-auto gap-2 border-border bg-card/50 hover:bg-card font-normal justify-between sm:justify-center',
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
            onSelect={(selectedRange) => {
              setRange(selectedRange);
              if (selectedRange?.from && selectedRange?.to) {
                setCustom(selectedRange.from, selectedRange.to);
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
