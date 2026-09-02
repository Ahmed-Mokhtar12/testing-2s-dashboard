import React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
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
import { ColleagueOptionLabel } from './ColleagueOptionLabel';
import { filterColleagues } from '@/lib/colleague-search';
import { cn } from '@/lib/utils';
import type { Colleague } from '@/types/hotel-training';

// The trainer field: the participant picker, multi-select.
//
// A SEPARATE COMPONENT rather than a `mode: 'single' | 'multi'` prop on ParticipantRow.
// That prop is the abstraction that accretes `if (mode === ...)` branches until neither
// caller's behaviour can be read off the file (docs/testing-lessons.md section 9) — and
// ParticipantRow is not a picker anyway, it is a row: a rowNo gutter, three metadata
// badges, a clear button. What the two genuinely share is extracted instead, into
// filterColleagues (the availability and search rule, where drift would break a stated
// requirement) and ColleagueOptionLabel (the option body, so "same look" stays true).

export type ColleaguesStatus = 'loading' | 'error' | 'ready';

interface Props {
  value: Colleague[];
  allColleagues: Colleague[];
  status: ColleaguesStatus;
  /** Employee ids already taken by a participant row. */
  unavailableEmployeeIds: ReadonlySet<string>;
  onChange: (next: Colleague[]) => void;
  /** id of the visible label element naming this picker. */
  ariaLabelledby?: string;
}

export function TrainerPicker({
  value,
  allColleagues,
  status,
  unavailableEmployeeIds,
  onChange,
  ariaLabelledby,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const selectedIds = React.useMemo(
    () => new Set(value.map((trainer) => trainer.employeeId)),
    [value],
  );

  // `keep` is this control's own selection. Trainers are not in `unavailableEmployeeIds`
  // — that set is the participants — so this changes nothing today; it is here because
  // the alternative is a control that can hide what it currently holds, which is how
  // filterColleagues is documented to be used and the one property its test pins.
  const available = React.useMemo(
    () => filterColleagues(allColleagues, search, {
      exclude: unavailableEmployeeIds,
      keep: selectedIds,
    }),
    [allColleagues, search, unavailableEmployeeIds, selectedIds],
  );

  // Three distinct reasons the list can be empty, and the user can act on a different
  // thing in each. Before this the field could not be empty at all — it had a
  // three-name hardcoded fallback — so "no trainers offered" is a new state and
  // silently showing "No active colleague found." while a read was still in flight
  // would read as a broken directory.
  const emptyMessage = status === 'loading'
    ? 'Loading colleagues...'
    : status === 'error'
      ? 'Could not load colleagues. Reload the page to try again.'
      : 'No active colleague found.';

  const toggle = (colleague: Colleague) => {
    onChange(
      selectedIds.has(colleague.employeeId)
        ? value.filter((trainer) => trainer.employeeId !== colleague.employeeId)
        : [...value, colleague],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          id="trainer-select"
          aria-labelledby={ariaLabelledby ? `${ariaLabelledby} trainer-select` : undefined}
          data-testid="trainer-select"
          className="h-auto min-h-9 w-full justify-between gap-1 whitespace-normal"
        >
          <span className="flex flex-wrap gap-1">
            {value.length > 0 ? (
              value.map((trainer) => (
                <Badge key={trainer.employeeId} variant="secondary">
                  {trainer.colleagueName}
                  {/* ONLY THE X REMOVES, not the whole badge.
                      The old trainer field put the remove handler on the badge itself,
                      with stopPropagation. The badges live INSIDE the popover trigger,
                      so once two were selected they covered most of it — and clicking
                      the middle of the field to open the list silently deleted a
                      trainer instead. Caught by an e2e test whose reopen click landed
                      on a badge; the defect is inherited, not new.

                      aria-hidden, and no role or tabIndex: this is a pointer shortcut
                      for an action that is already available and announced in the list
                      below (toggling a checked option off). Exposing it would both
                      nest an interactive element inside the trigger button and offer
                      screen readers a second, worse control for the same thing. */}
                  <span
                    aria-hidden="true"
                    data-testid={`remove-trainer-${trainer.employeeId}`}
                    className="ml-1 cursor-pointer rounded-sm hover:text-destructive"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange(value.filter((selected) => selected.employeeId !== trainer.employeeId));
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground font-normal">Select trainers...</span>
            )}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* shouldFilter={false}: filterColleagues is the single filter, so cmdk's
            built-in one cannot disagree with it about what matches. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type name or ID..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {available.map((colleague) => (
                <CommandItem
                  key={colleague.id}
                  value={`${colleague.colleagueName} ${colleague.employeeId}`}
                  onSelect={() => toggle(colleague)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      selectedIds.has(colleague.employeeId) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <ColleagueOptionLabel colleague={colleague} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
