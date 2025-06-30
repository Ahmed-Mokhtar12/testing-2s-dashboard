
-- Fix RLS policies for LongTermMemory table to allow edge function access
-- First, enable RLS on the table
ALTER TABLE public."LongTermMemory" ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role (edge functions) to read all data
CREATE POLICY "Service role can read all LongTermMemory" 
ON public."LongTermMemory" 
FOR SELECT 
TO service_role 
USING (true);

-- Create policy to allow service role (edge functions) to insert data
CREATE POLICY "Service role can insert LongTermMemory" 
ON public."LongTermMemory" 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Create policy to allow service role (edge functions) to update data
CREATE POLICY "Service role can update LongTermMemory" 
ON public."LongTermMemory" 
FOR UPDATE 
TO service_role 
USING (true);

-- Ensure other tables are accessible to service role for reading
-- Hotel Reviews table
ALTER TABLE public."Hotel Reviews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can read Hotel Reviews" 
ON public."Hotel Reviews" 
FOR SELECT 
TO service_role 
USING (true);

-- Chat History table
ALTER TABLE public."Chat History" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can read Chat History" 
ON public."Chat History" 
FOR SELECT 
TO service_role 
USING (true);

-- Info Summary table
ALTER TABLE public."Info Summary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can read Info Summary" 
ON public."Info Summary" 
FOR SELECT 
TO service_role 
USING (true);

-- Conducted Training table
ALTER TABLE public."Conducted Training" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can read Conducted Training" 
ON public."Conducted Training" 
FOR SELECT 
TO service_role 
USING (true);

-- N8N_2S table (for document search)
ALTER TABLE public."N8N_2S" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can read N8N_2S" 
ON public."N8N_2S" 
FOR SELECT 
TO service_role 
USING (true);
