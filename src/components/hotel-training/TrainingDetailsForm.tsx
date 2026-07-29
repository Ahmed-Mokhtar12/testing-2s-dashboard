import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Check, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { Textarea } from '@/components/ui/textarea';
import { DURATION_OPTIONS } from '@/lib/hotel-training-constants';
import { cn } from '@/lib/utils';
import type { TrainerRef, TrainingDetailsValues } from '@/types/hotel-training';

const DURATION_MINUTES = DURATION_OPTIONS.map((duration) => duration.minutes) as [number, ...number[]];
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

type ColumnType = 'Number' | 'Text' | 'Note' | string;
type FormValues = TrainingDetailsValues;

interface Props {
  defaultValues?: Partial<TrainingDetailsValues> | null;
  departments: string[];
  trainerOptions: TrainerRef[];
  locationTypeAsString?: ColumnType;
  remarksTypeAsString?: ColumnType;
  onNext: (values: TrainingDetailsValues) => void;
  onDraftChange?: (values: Partial<TrainingDetailsValues>) => void;
}

// 'Text' is the safe fallback when the column type is unknown: a text input
// can carry any value the user types, whereas a wrong 'Number' guess blocks
// legitimate input.
function isNumberColumn(typeAsString?: ColumnType) {
  return (typeAsString ?? 'Text').toLowerCase() === 'number';
}

function optionalColumnSchema(typeAsString?: ColumnType) {
  if (isNumberColumn(typeAsString)) {
    return z.preprocess(
      (value) => {
        if (value === '' || value === null || typeof value === 'undefined') return undefined;
        return typeof value === 'number' ? value : Number(value);
      },
      z.number().finite('Must be a valid number').optional(),
    );
  }

  return z.preprocess(
    (value) => {
      if (value === null || typeof value === 'undefined') return undefined;
      const text = String(value).trim();
      return text.length > 0 ? text : undefined;
    },
    z.string().optional(),
  );
}

function createSchema(locationTypeAsString?: ColumnType, remarksTypeAsString?: ColumnType) {
  return z.object({
    title: z.string().min(1, 'Training title is required'),
    department: z.string().min(1, 'Department is required'),
    durationMinutes: z.number({ required_error: 'Duration is required' }).refine(
      (value) => DURATION_MINUTES.includes(value),
      'Invalid duration',
    ),
    totalParticipants: z
      .number({ required_error: 'Total participants is required' })
      .int('Must be a whole number')
      .min(1, 'Must be at least 1')
      .max(15, 'Maximum 15 participants per training'),
    location: optionalColumnSchema(locationTypeAsString),
    remarks: optionalColumnSchema(remarksTypeAsString),
    date: z.date({ required_error: 'Date is required' }),
    hour: z.number().int().min(0).max(23),
    minute: z
      .number()
      .int()
      .min(0)
      .max(55)
      .refine((value) => value % 5 === 0, 'Minutes must be in 5-min increments'),
    trainers: z
      .array(
        z.object({
          displayName: z.string().min(1),
          email: z.string().min(1),
        }),
      )
      .min(1, 'At least one trainer is required'),
  });
}

function toNumberOrUndefined(value: string) {
  return value === '' ? undefined : Number(value);
}

export function TrainingDetailsForm({
  defaultValues,
  departments,
  trainerOptions,
  locationTypeAsString = 'Text',
  remarksTypeAsString = 'Text',
  onNext,
  onDraftChange,
}: Props) {
  const locationIsNumber = isNumberColumn(locationTypeAsString);
  const remarksIsNumber = isNumberColumn(remarksTypeAsString);
  const schema = React.useMemo(
    () => createSchema(locationTypeAsString, remarksTypeAsString),
    [locationTypeAsString, remarksTypeAsString],
  );

  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues
      ? {
          ...defaultValues,
          date: defaultValues.date instanceof Date ? defaultValues.date : new Date(defaultValues.date),
        }
      : {
          title: '',
          department: '',
          trainers: [],
          hour: 9,
          minute: 0,
        },
  });

  React.useEffect(() => {
    if (!defaultValues) return;

    reset({
      title: '',
      department: '',
      trainers: [],
      hour: 9,
      minute: 0,
      ...defaultValues,
      date: defaultValues.date ? new Date(defaultValues.date) : undefined,
    });
  }, [defaultValues, reset]);

  React.useEffect(() => {
    if (!onDraftChange) return;

    const subscription = watch((values) => {
      onDraftChange(values as Partial<TrainingDetailsValues>);
    });

    return () => subscription.unsubscribe();
  }, [onDraftChange, watch]);

  const selectedTrainers = watch('trainers') ?? [];
  const [trainerOpen, setTrainerOpen] = React.useState(false);

  const onSubmit = (values: FormValues) => {
    if (values.date < new Date(new Date().setHours(0, 0, 0, 0))) {
      toast.warning('Training date is in the past. Continue?', { duration: 3000 });
    }

    onNext(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">
          Training Title <span className="text-destructive">*</span>
        </Label>
        <Input id="title" placeholder="e.g. Fire Safety Training" {...register('title')} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>
          Department <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="department"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
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
          Training Duration <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="durationMinutes"
          control={control}
          render={({ field }) => (
            <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((duration) => (
                  <SelectItem key={duration.minutes} value={duration.minutes.toString()}>
                    {duration.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.durationMinutes && <p className="text-sm text-destructive">{errors.durationMinutes.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="totalParticipants">
          Total Participants <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="totalParticipants"
          control={control}
          render={({ field }) => (
            <Input
              id="totalParticipants"
              type="number"
              min={1}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(toNumberOrUndefined(event.target.value))}
            />
          )}
        />
        {errors.totalParticipants && <p className="text-sm text-destructive">{errors.totalParticipants.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>
          Date <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="date"
          control={control}
          render={({ field }) => (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !field.value && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
              </PopoverContent>
            </Popover>
          )}
        />
        {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>
          Time <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <Controller
            name="hour"
            control={control}
            render={({ field }) => (
              <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Hour" />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={hour.toString()}>
                      {String(hour).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <span className="self-center text-muted-foreground">:</span>
          <Controller
            name="minute"
            control={control}
            render={({ field }) => (
              <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value?.toString()}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Min" />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((minute) => (
                    <SelectItem key={minute} value={minute.toString()}>
                      {String(minute).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          Trainer Name <span className="text-destructive">*</span>
        </Label>
        <Popover open={trainerOpen} onOpenChange={setTrainerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" className="h-auto min-h-9 w-full justify-between gap-1 whitespace-normal">
              <span className="flex flex-wrap gap-1">
                {selectedTrainers.length > 0 ? (
                  selectedTrainers.map((trainer) => (
                    <Badge
                      key={trainer.email}
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setValue(
                          'trainers',
                          selectedTrainers.filter((selected) => selected.email !== trainer.email),
                          { shouldValidate: true },
                        );
                      }}
                    >
                      {trainer.displayName}
                      <X className="ml-1 h-3 w-3" />
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
            <Command>
              <CommandInput placeholder="Search trainers..." />
              <CommandList>
                <CommandEmpty>No trainer found.</CommandEmpty>
                <CommandGroup>
                  {trainerOptions.map((trainer) => {
                    const selected = selectedTrainers.some((current) => current.email === trainer.email);
                    return (
                      <CommandItem
                        key={trainer.email}
                        value={`${trainer.displayName} ${trainer.email}`}
                        onSelect={() => {
                          const next = selected
                            ? selectedTrainers.filter((current) => current.email !== trainer.email)
                            : [...selectedTrainers, trainer];
                          setValue('trainers', next, { shouldValidate: true });
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                        {trainer.displayName}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {errors.trainers && <p className="text-sm text-destructive">{errors.trainers.message}</p>}
        <p className="text-xs text-muted-foreground">
          Trainers must have opened the Training Record SharePoint site at least once.
        </p>
        <p className="text-xs text-muted-foreground">
          Trainer not listed? Ask them to open the Training Record SharePoint site once, then refresh.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Location</Label>
        <Controller
          name="location"
          control={control}
          render={({ field }) =>
            locationIsNumber ? (
              <Input
                id="location"
                type="number"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(toNumberOrUndefined(event.target.value))}
              />
            ) : (
              <Input
                id="location"
                type="text"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
              />
            )
          }
        />
        {errors.location && <p className="text-sm text-destructive">{errors.location.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="remarks">Remarks</Label>
        <Controller
          name="remarks"
          control={control}
          render={({ field }) =>
            remarksIsNumber ? (
              <Input
                id="remarks"
                type="number"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(toNumberOrUndefined(event.target.value))}
              />
            ) : (
              <Textarea
                id="remarks"
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
              />
            )
          }
        />
        {errors.remarks && <p className="text-sm text-destructive">{errors.remarks.message}</p>}
      </div>

      <Button type="submit" className="w-full">
        Next: Add Participants
      </Button>
    </form>
  );
}
