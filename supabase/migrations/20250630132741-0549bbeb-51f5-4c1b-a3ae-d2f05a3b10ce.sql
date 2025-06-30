
-- Create documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 
  'documents', 
  false, 
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png', 'image/gif']
);

-- Create storage policies for documents bucket
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow authenticated downloads" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "Allow authenticated deletions" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents');

-- Create uploaded_documents table to track document metadata and processing status
CREATE TABLE public.uploaded_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'uploading' CHECK (upload_status IN ('uploading', 'uploaded', 'processing', 'processed', 'failed', 'rejected')),
  relevance_score DECIMAL(3,2), -- AI-determined relevance score (0.00 to 1.00)
  relevance_reason TEXT, -- AI explanation for relevance decision
  document_category TEXT, -- AI-determined category (reviews, policies, reports, etc.)
  processing_error TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for better query performance
CREATE INDEX idx_uploaded_documents_session_id ON public.uploaded_documents(session_id);
CREATE INDEX idx_uploaded_documents_status ON public.uploaded_documents(upload_status);
CREATE INDEX idx_uploaded_documents_created_at ON public.uploaded_documents(created_at DESC);
CREATE INDEX idx_uploaded_documents_relevance_score ON public.uploaded_documents(relevance_score DESC);

-- Enhance N8N_2S table with document source tracking
ALTER TABLE public."N8N_2S" ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.uploaded_documents(id) ON DELETE CASCADE;
ALTER TABLE public."N8N_2S" ADD COLUMN IF NOT EXISTS chunk_index INTEGER;
ALTER TABLE public."N8N_2S" ADD COLUMN IF NOT EXISTS is_recent_context BOOLEAN DEFAULT false;

-- Create index for document-based vector searches
CREATE INDEX IF NOT EXISTS idx_n8n_2s_document_id ON public."N8N_2S"(document_id);
CREATE INDEX IF NOT EXISTS idx_n8n_2s_recent_context ON public."N8N_2S"(is_recent_context, created_at DESC);

-- Create function to mark documents as recent context (priority)
CREATE OR REPLACE FUNCTION public.mark_recent_document_context(doc_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- First, unmark all previous documents as recent
  UPDATE public."N8N_2S" SET is_recent_context = false WHERE is_recent_context = true;
  
  -- Mark the new document chunks as recent context
  UPDATE public."N8N_2S" SET is_recent_context = true WHERE document_id = doc_id;
  
  -- Update last accessed time
  UPDATE public.uploaded_documents SET last_accessed = now() WHERE id = doc_id;
END;
$$;

-- Create function to get recent document context for AI
CREATE OR REPLACE FUNCTION public.get_recent_document_context(limit_count INTEGER DEFAULT 5)
RETURNS TABLE(
  content TEXT,
  document_filename TEXT,
  document_category TEXT,
  chunk_index INTEGER,
  relevance_score DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.content,
    d.original_filename,
    d.document_category,
    n.chunk_index,
    d.relevance_score
  FROM public."N8N_2S" n
  JOIN public.uploaded_documents d ON n.document_id = d.id
  WHERE n.is_recent_context = true AND d.upload_status = 'processed'
  ORDER BY d.last_accessed DESC, n.chunk_index ASC
  LIMIT limit_count;
END;
$$;
