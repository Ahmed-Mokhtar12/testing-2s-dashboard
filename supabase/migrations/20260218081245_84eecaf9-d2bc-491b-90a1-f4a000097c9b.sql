
-- Add is_human_controlled column to track if a human agent has taken over the conversation
ALTER TABLE public."Chat History" 
ADD COLUMN IF NOT EXISTS is_human_controlled boolean NOT NULL DEFAULT false;

-- Add human_reply column to store messages sent by the human agent
ALTER TABLE public."Chat History"
ADD COLUMN IF NOT EXISTS human_reply text;

-- Add UPDATE policy so the service role can update the human control flag
CREATE POLICY "Service role can update Chat History"
ON public."Chat History"
FOR UPDATE
USING (true);
