-- Training report emails: department targets (empty for now — doubles as the
-- department universe for zero rows) and the send ledger that makes a
-- silently skipped month impossible.

create table public.training_targets (
  department text primary key,
  monthly_target_hours numeric null,
  updated_at timestamptz not null default now(),
  updated_by text null
);

alter table public.training_targets enable row level security;

create policy "staff can read training targets"
  on public.training_targets for select to authenticated
  using (public.is_hotel_staff(auth.uid()));

create policy "admins manage training targets"
  on public.training_targets for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

insert into public.training_targets (department) values
  ('Engineering'), ('Executive Office'), ('Finance'), ('Food & Beverage'),
  ('Front Office'), ('Housekeeping'), ('Human Resources'),
  ('Information Technology'), ('Kitchen'), ('Materials'), ('Recreation'),
  ('Revenue'), ('Sales & Marketing'), ('Security');

create table public.report_runs (
  report_type text not null check (report_type in ('monthly_summary', 'reminder')),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  status text not null check (status in ('sent', 'failed')),
  attempts integer not null default 0,
  last_error text null,
  sent_at timestamptz null,
  recipients text[] null,
  updated_at timestamptz not null default now(),
  primary key (report_type, period)
);

alter table public.report_runs enable row level security;

create policy "admins can read report runs"
  on public.report_runs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));
-- No authenticated write policies: only the service-role client writes.
