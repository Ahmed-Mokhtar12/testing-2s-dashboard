import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useColleagues } from '@/hooks/useColleagues';
import { invokeManageColleague } from '@/services/sharepoint';
import { ADMIN_EMAILS, DEPARTMENT_SECTIONS } from '@/lib/hotel-training-constants';
import type { Colleague } from '@/types/hotel-training';

const schema = z.object({
  name: z.string().regex(/^[A-Za-z ]+$/, 'Name must contain letters only').min(1, 'Name is required'),
  position: z.string().regex(/^[A-Za-z ]+$/, 'Position must contain letters only').min(1, 'Position is required'),
  department: z.string().min(1, 'Department is required'),
  section: z.string().min(1, 'Section is required'),
});

type FormValues = z.infer<typeof schema>;

export function EditMemberForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: colleagues = [] } = useColleagues();
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() ?? '');

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [reactivate, setReactivate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    control,
    getValues,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', position: '', department: '', section: '' },
  });

  // Active and inactive members are both listed; inactive ones get a badge
  // and can be reactivated.
  const matches = colleagues.filter(
    (colleague) =>
      search === '' ||
      colleague.colleagueName.toLowerCase().includes(search.toLowerCase()) ||
      colleague.employeeId.includes(search),
  );

  const selectMember = (colleague: Colleague) => {
    setSelected(colleague);
    setReactivate(false);
    reset({
      name: colleague.colleagueName,
      position: colleague.position,
      department: colleague.department,
      section: colleague.section,
    });
    setOpen(false);
    setSearch('');
  };

  const selectedDept = watch('department');
  const sections = selectedDept ? DEPARTMENT_SECTIONS[selectedDept] ?? [] : [];

  const values = watch();
  const changes = selected
    ? [
        { label: 'Name', from: selected.colleagueName, to: values.name },
        { label: 'Position', from: selected.position, to: values.position },
        { label: 'Department', from: selected.department, to: values.department },
        { label: 'Section', from: selected.section, to: values.section },
      ].filter((change) => change.from !== change.to)
    : [];
  const canSave = selected !== null && (changes.length > 0 || reactivate);

  const handleConfirmedSave = async () => {
    if (!isAdmin) {
      toast.error('Unauthorised action.');
      return;
    }
    if (!selected) return;

    const v = getValues();
    setSaving(true);
    try {
      await invokeManageColleague({
        action: 'update',
        itemId: selected.id,
        patch: {
          colleagueName: v.name,
          position: v.position,
          section: v.section,
          department: v.department,
          ...(reactivate ? { reactivate: true } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['colleagues'] });
      setSelected(null);
      setReactivate(false);
      reset({ name: '', position: '', department: '', section: '' });
      setConfirming(false);
      toast.success('Member updated successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member.');
    } finally {
      setSaving(false);
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
                <CommandEmpty>No colleague found.</CommandEmpty>
                <CommandGroup>
                  {matches.map((colleague) => (
                    <CommandItem
                      key={colleague.id}
                      value={`${colleague.colleagueName} ${colleague.employeeId}`}
                      onSelect={() => selectMember(colleague)}
                    >
                      <span className="font-medium">{colleague.colleagueName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">ID: {colleague.employeeId}</span>
                      {!colleague.isActive && (
                        <Badge variant="secondary" className="ml-auto">
                          Inactive
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selected && (
        <form onSubmit={handleSubmit(() => setConfirming(true))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-employee-id">Employee ID</Label>
            <Input id="edit-employee-id" value={selected.employeeId} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-position">
              Position <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-position" {...register('position')} />
            {errors.position && <p className="text-sm text-destructive">{errors.position.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Department <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="department"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue('section', '');
                  }}
                  value={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(DEPARTMENT_SECTIONS).map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.department && <p className="text-sm text-destructive">{errors.department.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Section <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="section"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedDept}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedDept ? 'Select section' : 'Select department first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section} value={section}>
                        {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.section && <p className="text-sm text-destructive">{errors.section.message}</p>}
          </div>

          {!selected.isActive && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <p>This member is inactive and cannot be selected in trainings.</p>
              <div className="flex items-center gap-2">
                <Switch id="edit-reactivate" checked={reactivate} onCheckedChange={setReactivate} />
                <Label htmlFor="edit-reactivate">Reactivate this member</Label>
              </div>
            </div>
          )}

          <Button type="submit" disabled={!canSave || saving} className="w-full">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply changes to {selected?.colleagueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Past training records keep their original values; only future submissions use the new details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-sm">
            {changes.map((change) => (
              <li key={change.label}>
                {change.label}: {change.from} → {change.to}
              </li>
            ))}
            {reactivate && <li>Will be reactivated</li>}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedSave} disabled={saving}>
              {saving ? 'Saving...' : 'Yes, save changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
