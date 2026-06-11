import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Colleague, ParticipantRow as ParticipantRowType } from '@/types/hotel-training';

interface Props {
  row: ParticipantRowType;
  allColleagues: Colleague[];
  selectedEmployeeIds: Set<string>;
  onChange: (colleague: Colleague | null) => void;
}

export function ParticipantRow({ row, allColleagues, selectedEmployeeIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const available = allColleagues.filter((colleague) => {
    const isCurrentSelection = colleague.employeeId === row.colleague?.employeeId;
    const matchesSearch =
      search === '' ||
      colleague.colleagueName.toLowerCase().includes(search.toLowerCase()) ||
      colleague.employeeId.includes(search);

    return colleague.isActive && (isCurrentSelection || !selectedEmployeeIds.has(colleague.employeeId)) && matchesSearch;
  });

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <span className="w-6 shrink-0 pt-2 text-sm font-medium text-muted-foreground">{row.rowNo}</span>

      <div className="flex-1 space-y-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="w-full justify-start font-normal"
              data-testid={`participant-select-${row.rowNo}`}
            >
              {row.colleague ? (
                `${row.colleague.colleagueName} (${row.colleague.employeeId})`
              ) : (
                <span className="text-muted-foreground">Search by name or Employee ID...</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Type name or ID..." value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>No active colleague found.</CommandEmpty>
                <CommandGroup>
                  {available.map((colleague) => (
                    <CommandItem
                      key={colleague.id}
                      value={`${colleague.colleagueName} ${colleague.employeeId}`}
                      onSelect={() => {
                        onChange(colleague);
                        setOpen(false);
                        setSearch('');
                      }}
                    >
                      <span className="font-medium">{colleague.colleagueName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">ID: {colleague.employeeId}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {row.colleague && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Position: {row.colleague.position}</Badge>
            <Badge variant="outline">Section: {row.colleague.section}</Badge>
            <Badge variant="outline">Dept: {row.colleague.department}</Badge>
          </div>
        )}
      </div>

      {row.colleague && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onChange(null)}
          aria-label="Clear participant"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
