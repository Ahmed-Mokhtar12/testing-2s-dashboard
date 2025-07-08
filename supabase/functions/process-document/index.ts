
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import pdfParse from 'https://esm.sh/pdf-parse@1.1.1';

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

  // Health check endpoint
  const body = await req.json().catch(() => ({}));
  if (body.health === 'check') {
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'process-document'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { documentId, sessionId }: DocumentProcessingRequest = body.documentId ? body : await req.json();
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
    try {
      if (document.mime_type === 'text/plain') {
        textContent = await fileData.text();
      } else if (document.mime_type === 'application/pdf') {
        textContent = await extractPDFText(fileData);
      } else if (document.mime_type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
                 document.mime_type.includes('application/msword')) {
        textContent = await extractWordText(fileData);
      } else if (document.mime_type.includes('image/')) {
        textContent = await processImageWithOCR(fileData, document.original_filename);
      } else {
        console.warn(`⚠️ Unsupported file type: ${document.mime_type}`);
        textContent = `Document: ${document.original_filename}. Unsupported format: ${document.mime_type}. Manual review required.`;
      }
    } catch (extractionError) {
      console.error('❌ Text extraction failed:', extractionError);
      textContent = `Document: ${document.original_filename}. Text extraction failed: ${extractionError.message}`;
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
    
    // Update document status to failed if we have documentId
    const { documentId: docIdFromBody } = await req.json().catch(() => ({ documentId: null }));
    const finalDocumentId = documentId || docIdFromBody;
    
    if (finalDocumentId) {
      try {
        await supabase
          .from('uploaded_documents')
          .update({ 
            upload_status: 'failed',
            processing_error: error.message || 'Processing failed'
          })
          .eq('id', finalDocumentId);
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
    }
    
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      documentId: finalDocumentId || 'unknown'
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

// PDF Text Extraction
async function extractPDFText(fileData: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const pdf = await pdfParse(buffer);
    
    if (pdf.text && pdf.text.length > 50) {
      console.log('✅ PDF text extracted successfully, length:', pdf.text.length);
      return pdf.text;
    } else {
      console.warn('⚠️ PDF text extraction returned minimal content');
      return 'PDF document processed but minimal text content was extracted. This may be a scanned PDF that requires OCR.';
    }
  } catch (error) {
    console.error('❌ PDF extraction error:', error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

// Enhanced Word Document Text Extraction
async function extractWordText(fileData: Blob): Promise<string> {
  try {
    console.log('📄 Processing Word document, type:', fileData.type);
    
    // For .docx files, extract text from XML structure
    if (fileData.type.includes('openxmlformats') || fileData.type.includes('wordprocessingml')) {
      const arrayBuffer = await fileData.arrayBuffer();
      const text = await extractDocxText(arrayBuffer);
      
      if (text && text.length > 50) {
        console.log('✅ DOCX text extraction successful, length:', text.length);
        return text;
      } else {
        console.warn('⚠️ DOCX extraction returned minimal content');
        return 'Word document processed but minimal text content was extracted. The document may contain mostly images, tables, or complex formatting.';
      }
    } 
    // For older .doc files
    else if (fileData.type.includes('msword') || fileData.type === 'application/msword') {
      console.warn('⚠️ Legacy .doc format detected');
      // Try basic text extraction for .doc files
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let rawText = decoder.decode(uint8Array);
      
      // Clean up extracted text (basic approach for .doc files)
      rawText = rawText.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ') // Remove control characters
                       .replace(/\s+/g, ' ') // Normalize whitespace
                       .trim();
      
      if (rawText.length > 100) {
        console.log('✅ Legacy .doc text extraction completed, length:', rawText.length);
        return rawText.substring(0, 5000); // Limit to 5000 chars
      } else {
        return 'Legacy Word document (.doc format) uploaded. For better text extraction, please convert to .docx format or PDF before uploading.';
      }
    } else {
      console.warn('⚠️ Unrecognized Word document format:', fileData.type);
      return 'Word document uploaded but format not fully supported. Please try converting to .docx or PDF format for better text extraction.';
    }
  } catch (error) {
    console.error('❌ Word extraction error:', error);
    throw new Error(`Word document text extraction failed: ${error.message}`);
  }
}

// Basic DOCX text extraction
async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // This is a simplified approach - in production you'd want a proper DOCX parser
    const text = new TextDecoder().decode(arrayBuffer);
    
    // Extract text between XML tags (very basic approach)
    const textMatches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches) {
      const extractedText = textMatches
        .map(match => match.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, '$1'))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (extractedText.length > 50) {
        console.log('✅ DOCX text extracted successfully, length:', extractedText.length);
        return extractedText;
      }
    }
    
    console.warn('⚠️ DOCX text extraction returned minimal content');
    return 'Word document processed but text extraction was limited. Document may contain complex formatting, tables, or images.';
  } catch (error) {
    console.error('❌ DOCX parsing error:', error);
    throw new Error(`DOCX parsing failed: ${error.message}`);
  }
}

// Image OCR Processing (placeholder for future implementation)
async function processImageWithOCR(fileData: Blob, filename: string): Promise<string> {
  console.log('📷 Processing image for OCR:', filename);
  
  // For now, we'll use OpenAI's vision capabilities as a fallback
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    return `Image file: ${filename}. OCR processing requires OpenAI API configuration. Please convert image to text manually or upload a text document.`;
  }
  
  try {
    // Convert image to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = fileData.type;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this image. If this is a document, transcribe it completely. If it contains tables, preserve the structure. Return only the extracted text.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000
      }),
    });
    
    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    if (extractedText && extractedText.length > 20) {
      console.log('✅ Image OCR completed successfully, length:', extractedText.length);
      return extractedText;
    } else {
      return `Image file: ${filename}. OCR processing completed but minimal text was detected. This may be a non-text image.`;
    }
  } catch (error) {
    console.error('❌ Image OCR error:', error);
    return `Image file: ${filename}. OCR processing failed: ${error.message}`;
  }
}
