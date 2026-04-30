CREATE TABLE public.prompt_evaluation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT 'Main Agent',
  prompt_version_hash TEXT NOT NULL,
  prompt_full_text TEXT NOT NULL,
  prompt_char_count INTEGER NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PASS', 'IMPROVE', 'CRITICAL')),
  criteria_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  conversations_evaluated INTEGER NOT NULL DEFAULT 0,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  prompt_diff_from_previous TEXT,
  score_delta_from_previous NUMERIC(5,2),
  evaluator_model TEXT NOT NULL DEFAULT 'gpt-4o',
  evaluation_duration_ms INTEGER,
  raw_evaluator_output JSONB,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_eval_workflow ON public.prompt_evaluation_history(workflow_id, evaluated_at DESC);
CREATE INDEX idx_prompt_eval_date ON public.prompt_evaluation_history(evaluated_at DESC);
CREATE INDEX idx_prompt_eval_hash ON public.prompt_evaluation_history(prompt_version_hash);

ALTER TABLE public.prompt_evaluation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hotel staff can view evaluation history"
ON public.prompt_evaluation_history
FOR SELECT
TO authenticated
USING (public.is_hotel_staff(auth.uid()));

CREATE POLICY "Service role can insert evaluations"
ON public.prompt_evaluation_history
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can read all evaluations"
ON public.prompt_evaluation_history
FOR SELECT
TO service_role
USING (true);