
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentProcessingRequest {
  documentId: string;
  sessionId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { documentId, sessionId }: DocumentProcessingRequest = await req.json();
    console.log('🔄 Processing document:', documentId);

    // Update document status to processing
    await supabase
      .from('uploaded_documents')
      .update({ upload_status: 'processing' })
      .eq('id', documentId);

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('uploaded_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // Download file content from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Extract text content based on file type
    let textContent = '';
    if (document.mime_type === 'text/plain') {
      textContent = await fileData.text();
    } else if (document.mime_type.includes('image/')) {
      // For images, we'll use OCR or image description
      textContent = `Image file: ${document.original_filename}. Visual content analysis needed.`;
    } else {
      // For PDFs and other documents, we'll extract basic text
      textContent = `Document: ${document.original_filename}. Content extraction needed for ${document.mime_type}.`;
    }

    console.log('📄 Extracted text length:', textContent.length);

    // AI Relevance Assessment
    const relevanceAssessment = await assessDocumentRelevance(textContent, document.original_filename);
    
    console.log('🤖 AI Relevance Assessment:', relevanceAssessment);

    // Update document with AI assessment
    await supabase
      .from('uploaded_documents')
      .update({
        relevance_score: relevanceAssessment.score,
        relevance_reason: relevanceAssessment.reason,
        document_category: relevanceAssessment.category,
        upload_status: relevanceAssessment.score >= 0.3 ? 'processed' : 'rejected'
      })
      .eq('id', documentId);

    // If document is relevant, process for vector storage
    if (relevanceAssessment.score >= 0.3) {
      const chunks = chunkText(textContent, 500); // 500 character chunks
      console.log('📝 Created chunks:', chunks.length);

      // Generate embeddings and store in N8N_2S table
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // For now, we'll store without embeddings (embeddings would require additional setup)
        await supabase
          .from('N8N_2S')
          .insert({
            content: chunk,
            document_id: documentId,
            chunk_index: i,
            metadata: {
              filename: document.original_filename,
              category: relevanceAssessment.category,
              relevance_score: relevanceAssessment.score,
              chunk_index: i,
              total_chunks: chunks.length
            }
          });
      }

      // Update chunk count
      await supabase
        .from('uploaded_documents')
        .update({
          chunk_count: chunks.length,
          processed_at: new Date().toISOString()
        })
        .eq('id', documentId);

      // Mark as recent context for AI priority
      await supabase.rpc('mark_recent_document_context', { doc_id: documentId });

      console.log('✅ Document processed successfully');
    } else {
      console.log('❌ Document rejected due to low relevance');
    }

    return new Response(JSON.stringify({
      success: true,
      documentId,
      relevanceScore: relevanceAssessment.score,
      status: relevanceAssessment.score >= 0.3 ? 'processed' : 'rejected',
      reason: relevanceAssessment.reason
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error processing document:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function assessDocumentRelevance(content: string, filename: string) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    console.warn('⚠️ OpenAI API key not found, using fallback assessment');
    return {
      score: 0.5,
      reason: 'OpenAI not configured - using fallback assessment',
      category: 'general'
    };
  }

  try {
    const prompt = `
Analyze this document for a hotel management system. Assess its relevance and categorize it.

Document: ${filename}
Content preview: ${content.substring(0, 1000)}...

Please respond with a JSON object containing:
- score: relevance score from 0.0 to 1.0 (1.0 = highly relevant)
- reason: brief explanation of relevance
- category: one of [reviews, policies, training, reports, general, other]

Consider relevant: guest reviews, hotel policies, staff training materials, operational reports, customer feedback, booking information, service standards.
Consider less relevant: personal documents, unrelated business content, spam.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an AI assistant that evaluates document relevance for hotel management systems. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    try {
      return JSON.parse(aiResponse);
    } catch (parseError) {
      console.warn('Failed to parse AI response, using fallback');
      return {
        score: 0.5,
        reason: 'AI response parsing failed',
        category: 'general'
      };
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
    return {
      score: 0.4,
      reason: 'AI assessment failed, using conservative score',
      category: 'general'
    };
  }
}

function chunkText(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk + '.');
      }
      currentChunk = trimmedSentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk + '.');
  }
  
  return chunks.length > 0 ? chunks : [text.substring(0, maxChunkSize)];
}
