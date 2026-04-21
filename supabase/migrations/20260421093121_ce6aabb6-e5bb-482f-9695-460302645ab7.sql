
-- 1) Add released_to_ai_at column to Chat History
ALTER TABLE public."Chat History"
ADD COLUMN IF NOT EXISTS released_to_ai_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_chat_history_released_to_ai_at
ON public."Chat History" ("Sender Number", released_to_ai_at)
WHERE released_to_ai_at IS NOT NULL;

-- 2) Enable extensions for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
