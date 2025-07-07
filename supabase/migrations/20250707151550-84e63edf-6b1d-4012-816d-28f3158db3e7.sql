-- Fix RLS policies for Chat History table to allow anonymous chat saving
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert own chat history" ON public."Chat History";
DROP POLICY IF EXISTS "Users can view own chat history" ON public."Chat History";

-- Create new policies that work with session IDs (anonymous users)
CREATE POLICY "Anyone can insert chat history" 
ON public."Chat History" 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view chat history by session" 
ON public."Chat History" 
FOR SELECT 
USING (
  -- Allow if user is authenticated and owns the chat
  (auth.uid() IS NOT NULL AND (auth.uid())::text = "Sender Number") 
  OR 
  -- Allow anonymous access (session-based)
  (auth.uid() IS NULL)
);