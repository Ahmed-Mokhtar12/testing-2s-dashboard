-- Add is_archived column to Chat History table for soft delete functionality
ALTER TABLE public."Chat History" 
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

-- Create index for better performance when filtering archived conversations
CREATE INDEX idx_chat_history_archived ON public."Chat History" (is_archived, created_at DESC);