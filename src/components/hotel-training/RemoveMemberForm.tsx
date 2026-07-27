import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { useAuth } from '@/hooks/useAuth';
import { useColleagues } from '@/hooks/useColleagues';
import { invokeManageColleague } from '@/services/sharepoint';
import { ADMIN_EMAILS } from '@/lib/hotel-training-constants';
import type { Colleague } from '@/types/hotel-training';

export function RemoveMemberForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: colleagues = [] } = useColleagues();
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() ?? '');

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const active = colleagues.filter(
    (colleague) =>
      colleague.isActive &&
      (search === '' ||
        colleague.colleagueName.toLowerCase().includes(search.toLowerCase()) ||
        colleague.employeeId.includes(search)),
  );

  const handleRemove = async () => {
    if (!isAdmin) {
      toast.error('Unauthorised action.');
      return;
    }
    if (!selected) return;

    setRemoving(true);
    try {
      await invokeManageColleague({ action: 'deactivate', itemId: selected.id });
      await queryClient.invalidateQueries({ queryKey: ['colleagues'] });
      setSelected(null);
      setConfirming(false);
      toast.success('Member removed successfully. The member is now inactive.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Search colleague</label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-start font-normal">
              {selected ? (
                `${selected.colleagueName} (${selected.employeeId})`
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
                  {active.map((colleague) => (
                    <CommandItem
                      key={colleague.id}
                      value={`${colleague.colleagueName} ${colleague.employeeId}`}
                      onSelect={() => {
                        setSelected(colleague);
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
      </div>

      {selected && (
        <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
          <div className="grid grid-cols-2 gap-y-1">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{selected.colleagueName}</span>
            <span className="text-muted-foreground">Employee ID</span>
            <span>{selected.employeeId}</span>
            <span className="text-muted-foreground">Position</span>
            <span>{selected.position}</span>
            <span className="text-muted-foreground">Department</span>
            <span>{selected.department}</span>
            <span className="text-muted-foreground">Section</span>
            <span>{selected.section}</span>
          </div>
          <Button type="button" variant="destructive" className="mt-2 w-full" onClick={() => setConfirming(true)}>
            Remove Member
          </Button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selected?.colleagueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selected?.colleagueName}. They will no longer be selectable in training sessions.
              Old records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removing}>
              {removing ? 'Removing...' : 'Yes, deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
