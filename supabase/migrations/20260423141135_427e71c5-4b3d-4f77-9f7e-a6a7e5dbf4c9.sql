-- Allow authenticated users (logged-in staff) to read and update Chat History
CREATE POLICY "Authenticated staff can read Chat History"
  ON public."Chat History"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated staff can update Chat History"
  ON public."Chat History"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);