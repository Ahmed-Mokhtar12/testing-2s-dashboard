-- Enable RLS on tables that currently have it disabled
ALTER TABLE public."Sop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for Sop table
-- Assuming SOPs should be readable by authenticated users only
CREATE POLICY "Authenticated users can read SOPs" 
ON public."Sop" 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage SOPs" 
ON public."Sop" 
FOR ALL 
USING (auth.role() = 'service_role');

-- Create RLS policies for uploaded_documents table  
-- Documents should be accessible by session or authenticated users
CREATE POLICY "Users can read their own uploaded documents by session" 
ON public.uploaded_documents 
FOR SELECT 
USING (auth.uid()::text = session_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own uploaded documents" 
ON public.uploaded_documents 
FOR INSERT 
WITH CHECK (auth.uid()::text = session_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own uploaded documents" 
ON public.uploaded_documents 
FOR UPDATE 
USING (auth.uid()::text = session_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete their own uploaded documents" 
ON public.uploaded_documents 
FOR DELETE 
USING (auth.uid()::text = session_id OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage all uploaded documents" 
ON public.uploaded_documents 
FOR ALL 
USING (auth.role() = 'service_role');