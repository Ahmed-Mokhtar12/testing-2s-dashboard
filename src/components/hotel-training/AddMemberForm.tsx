import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useColleagues } from '@/hooks/useColleagues';
import { invokeManageColleague } from '@/services/sharepoint';
import { collapseColleagueFields } from '@/lib/text';
import { ADMIN_EMAILS, DEPARTMENT_SECTIONS } from '@/lib/hotel-training-constants';

const schema = z.object({
  employeeId: z.string().regex(/^\d+$/, 'Employee ID must contain numbers only'),
  name: z.string().regex(/^[A-Za-z ]+$/, 'Name must contain letters only').min(1, 'Name is required'),
  position: z.string().regex(/^[A-Za-z ]+$/, 'Position must contain letters only').min(1, 'Position is required'),
  department: z.string().min(1, 'Department is required'),
  section: z.string().min(1, 'Section is required'),
});

type FormValues = z.infer<typeof schema>;

export function AddMemberForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: colleagues = [] } = useColleagues();
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() ?? '');

  const {
    control,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const selectedDept = watch('department');
  const sections = selectedDept ? DEPARTMENT_SECTIONS[selectedDept] ?? [] : [];

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin) {
      toast.error('Unauthorised action.');
      return;
    }

    const exists = colleagues.some((colleague) => colleague.employeeId === values.employeeId);
    if (exists) {
      setError('employeeId', { message: 'This Employee ID already exists.' });
      return;
    }

    try {
      // Normalised here as well as in the edge function, which is authoritative. Sending
      // the value that will actually be stored keeps the success toast and the list
      // refresh from describing something different from what landed.
      await invokeManageColleague({
        action: 'add',
        colleague: collapseColleagueFields({
          employeeId: values.employeeId,
          colleagueName: values.name,
          position: values.position,
          section: values.section,
          department: values.department,
        }),
      });

      await queryClient.invalidateQueries({ queryKey: ['colleagues'] });
      reset();
      toast.success('New member added successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="employeeId">
          Employee ID <span className="text-destructive">*</span>
        </Label>
        <Input id="employeeId" {...register('employeeId')} placeholder="e.g. 12345" />
        {errors.employeeId && <p className="text-sm text-destructive">{errors.employeeId.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input id="name" {...register('name')} placeholder="e.g. John Smith" />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="position">
          Position <span className="text-destructive">*</span>
        </Label>
        <Input id="position" {...register('position')} placeholder="e.g. Supervisor" />
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

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Adding...' : 'Add Member'}
      </Button>
    </form>
  );
}
