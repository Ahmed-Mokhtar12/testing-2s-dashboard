-- Create Website Chats table for web interface chats (separate from WhatsApp chats)
CREATE TABLE public.website_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message TEXT,
  ai_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for better performance
CREATE INDEX idx_website_chats_session_id ON public.website_chats(session_id);
CREATE INDEX idx_website_chats_created_at ON public.website_chats(created_at DESC);
CREATE INDEX idx_website_chats_user_id ON public.website_chats(user_id);

-- Enable Row Level Security
ALTER TABLE public.website_chats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can insert website chats" 
ON public.website_chats 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view their own website chats or guest chats" 
ON public.website_chats 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  user_id IS NULL OR
  auth.uid() IS NULL
);

CREATE POLICY "Users can update their own website chats" 
ON public.website_chats 
FOR UPDATE 
USING (
  auth.uid() = user_id OR 
  user_id IS NULL OR
  auth.uid() IS NULL
);

CREATE POLICY "Users can delete their own website chats" 
ON public.website_chats 
FOR DELETE 
USING (
  auth.uid() = user_id OR 
  user_id IS NULL OR
  auth.uid() IS NULL
);

-- Service role can do everything
CREATE POLICY "Service role can read website chats" 
ON public.website_chats 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can insert website chats" 
ON public.website_chats 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can update website chats" 
ON public.website_chats 
FOR UPDATE 
USING (true);

CREATE POLICY "Service role can delete website chats" 
ON public.website_chats 
FOR DELETE 
USING (true);