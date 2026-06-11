-- supabase/migrations/20260610120000_hotel_training.sql

create table public.training_sessions (
  id                 uuid        primary key default gen_random_uuid(),
  sharepoint_id      text        not null,
  training_id        text        not null unique,
  title              text        not null,
  department         text        not null,
  duration_minutes   integer     not null,
  location           text,
  remarks            text,
  training_date      timestamptz not null,
  trainer_names      text[]      not null,
  total_participants integer     not null,
  submitted_by       text        not null,
  submitted_at       timestamptz not null default now(),
  sync_status        text        not null default 'synced'
    check (sync_status in ('synced', 'partial', 'failed'))
);

create table public.training_participants (
  id             uuid    primary key default gen_random_uuid(),
  training_id    text    not null references public.training_sessions(training_id),
  row_no         integer not null,
  employee_id    text    not null,
  colleague_name text    not null,
  position       text    not null,
  section        text    not null,
  department     text    not null,
  unique (training_id, row_no),
  unique (training_id, employee_id)
);

create table public.training_sync_queue (
  id             uuid        primary key default gen_random_uuid(),
  training_id    text        not null,
  payload        jsonb       not null,
  failure_reason text,
  created_at     timestamptz not null default now(),
  resolved       boolean     not null default false
);

alter table public.training_sessions    enable row level security;
alter table public.training_participants enable row level security;
alter table public.training_sync_queue  enable row level security;

create policy "users can insert training sessions"
  on public.training_sessions for insert to authenticated
  with check (submitted_by = auth.jwt()->>'email');

create policy "admins can read all training sessions"
  on public.training_sessions for select to authenticated
  using (lower(auth.jwt()->>'email') in (
    'ahmed.mokhtar@2seasonshotels.com',
    'amir.monir@2seasonshotels.com',
    'xarmaigne.narciso@2seasonshotels.com'
  ));

create policy "users can insert participants for their sessions"
  on public.training_participants for insert to authenticated
  with check (
    exists (
      select 1 from public.training_sessions ts
      where ts.training_id = training_participants.training_id
        and lower(ts.submitted_by) = lower(auth.jwt()->>'email')
    )
  );

create policy "admins can read all participants"
  on public.training_participants for select to authenticated
  using (lower(auth.jwt()->>'email') in (
    'ahmed.mokhtar@2seasonshotels.com',
    'amir.monir@2seasonshotels.com',
    'xarmaigne.narciso@2seasonshotels.com'
  ));

create policy "users can insert sync queue entries"
  on public.training_sync_queue for insert to authenticated
  with check (true);

create policy "admins can read sync queue"
  on public.training_sync_queue for select to authenticated
  using (lower(auth.jwt()->>'email') in (
    'ahmed.mokhtar@2seasonshotels.com',
    'amir.monir@2seasonshotels.com',
    'xarmaigne.narciso@2seasonshotels.com'
  ));
