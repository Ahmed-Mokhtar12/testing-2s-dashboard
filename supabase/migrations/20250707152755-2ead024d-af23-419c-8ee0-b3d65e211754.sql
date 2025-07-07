-- Add DELETE policy for Chat History table to allow users to delete conversations
CREATE POLICY "Users can delete chat history by session" 
ON public."Chat History" 
FOR DELETE 
USING (
  -- Allow if user is authenticated and owns the chat
  (auth.uid() IS NOT NULL AND (auth.uid())::text = "Sender Number") 
  OR 
  -- Allow anonymous access (session-based)
  (auth.uid() IS NULL)
);