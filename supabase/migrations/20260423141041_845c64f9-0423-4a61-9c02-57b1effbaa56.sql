-- Drop existing permissive policies on Chat History
DROP POLICY IF EXISTS "Authenticated users can read Chat History" ON public."Chat History";
DROP POLICY IF EXISTS "Authenticated users can update Chat History" ON public."Chat History";

-- Restrict to service_role only (access via Edge Functions)
CREATE POLICY "Service role full access to Chat History"
  ON public."Chat History"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);