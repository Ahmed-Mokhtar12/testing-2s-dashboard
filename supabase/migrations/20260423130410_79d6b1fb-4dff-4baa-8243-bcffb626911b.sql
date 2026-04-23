ALTER TABLE public."Chat History"
ADD COLUMN IF NOT EXISTS replied_by_user_id uuid NULL,
ADD COLUMN IF NOT EXISTS replied_by_name text NULL;