
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

// Enhanced text extraction for different file types
async function extractTextFromFile(buffer: ArrayBuffer, mimeType: string, filename: string): Promise<string> {
  try {
    console.log(`🔍 Extracting text from ${filename} (${mimeType})`);
    
    // Handle Word documents (.doc, .docx)
    if (mimeType.includes('word') || mimeType.includes('officedocument.wordprocessingml') || filename.endsWith('.docx') || filename.endsWith('.doc')) {
      return await extractTextFromWord(buffer);
    }
    
    // Handle PDF documents
    if (mimeType.includes('pdf') || filename.endsWith('.pdf')) {
      return await extractTextFromPDF(buffer);
    }
    
    // Handle text files
    if (mimeType.includes('text') || filename.endsWith('.txt')) {
      const decoder = new TextDecoder();
      return decoder.decode(buffer);
    }
    
    // Handle other formats
    console.log(`⚠️ Unsupported file type: ${mimeType}, attempting text extraction...`);
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
    
  } catch (error) {
    console.error('❌ Text extraction failed:', error);
    throw new Error(`Failed to extract text from ${filename}: ${error.message}`);
  }
}

// Extract text from Word documents
async function extractTextFromWord(buffer: ArrayBuffer): Promise<string> {
  try {
    // For .docx files (Office Open XML)
    const uint8Array = new Uint8Array(buffer);
    
    // Convert to text - basic extraction for demonstration
    // In a real implementation, you'd use a proper Word parsing library
    const decoder = new TextDecoder();
    let content = decoder.decode(uint8Array);
    
    // Try to extract readable text (basic approach)
    // Remove binary content and extract text between XML tags
    content = content.replace(new RegExp('[\\x00-\\x1F\\x7F-\\x9F]', 'g'), ' '); // Remove control characters
    content = content.replace(/<[^>]*>/g, ' '); // Remove XML tags
    content = content.replace(/\s+/g, ' '); // Normalize whitespace
    content = content.trim();
    
    if (content.length < 50) {
      throw new Error('Insufficient text content extracted from Word document');
    }
    
    console.log(`✅ Extracted ${content.length} characters from Word document`);
    return content;
  } catch (error) {
    console.error('❌ Word extraction error:', error);
    throw new Error(`Word document processing failed: ${error.message}`);
  }
}

// Extract text from PDF documents  
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    // Basic PDF text extraction
    const decoder = new TextDecoder();
    let content = decoder.decode(buffer);
    
    // Extract text from PDF streams (basic approach)
    content = content.replace(new RegExp('[\\x00-\\x1F\\x7F-\\x9F]', 'g'), ' ');
    content = content.replace(/\s+/g, ' ');
    content = content.trim();
    
    if (content.length < 50) {
      throw new Error('Insufficient text content extracted from PDF');
    }
    
    console.log(`✅ Extracted ${content.length} characters from PDF`);
    return content;
  } catch (error) {
    console.error('❌ PDF extraction error:', error);
    throw new Error(`PDF processing failed: ${error.message}`);
  }
}
import pdfParse from 'https://esm.sh/pdf-parse@1.1.1';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentProcessingRequest {
  documentId: string;
  sessionId: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const matchesMagicSignature = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value);

const validateServerFileSignature = (mimeType: string, bytes: Uint8Array) => {
  if (mimeType === 'application/pdf') {
    return matchesMagicSignature(bytes, [0x25, 0x50, 0x44, 0x46]);
  }

  if (mimeType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
    return matchesMagicSignature(bytes, [0x50, 0x4b]);
  }

  if (mimeType === 'image/jpeg') {
    return matchesMagicSignature(bytes, [0xff, 0xd8, 0xff]);
  }

  if (mimeType === 'image/png') {
    return matchesMagicSignature(bytes, [0x89, 0x50, 0x4e, 0x47]);
  }

  return true;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse request body once at the beginning
  let body: any = {};
  try {
    body = await req.json();
  } catch (parseError) {
    console.warn('Failed to parse request body:', parseError);
    body = {};
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    
    // Health check endpoint
    if (body.health === 'check') {
      console.log('🔍 Health check requested');
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'process-document'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { documentId, sessionId }: DocumentProcessingRequest = body;
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

    if (document.file_size > MAX_UPLOAD_BYTES) {
      throw new Error('File exceeds the 10MB server-side upload limit');
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    if (!validateServerFileSignature(document.mime_type, fileBytes)) {
      throw new Error(`Declared file type does not match file signature for ${document.original_filename}`);
    }

    // Extract text content based on file type
    let textContent = '';
    try {
      console.log(`🔍 Processing file type: ${document.mime_type} | ${document.original_filename}`);
      
      if (document.mime_type === 'text/plain' || document.mime_type === 'text/rtf') {
        textContent = await extractTextFile(fileData);
      } else if (document.mime_type === 'application/pdf') {
        textContent = await extractPDFText(fileData);
      } else if (document.mime_type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
                 document.mime_type.includes('application/msword')) {
        textContent = await extractWordText(fileData);
      } else if (document.mime_type.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
                 document.mime_type.includes('application/vnd.ms-excel') ||
                 document.mime_type === 'text/csv') {
        textContent = await extractSpreadsheetText(fileData, document.original_filename);
      } else if (document.mime_type.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation') ||
                 document.mime_type.includes('application/vnd.ms-powerpoint')) {
        textContent = await extractPresentationText(fileData, document.original_filename);
      } else if (document.mime_type.includes('application/vnd.oasis.opendocument')) {
        textContent = await extractOpenDocumentText(fileData, document.original_filename);
      } else if (document.mime_type.includes('image/')) {
        textContent = await processImageWithOCR(fileData, document.original_filename);
      } else if (document.mime_type === 'application/json' || document.mime_type === 'application/xml' || 
                 document.mime_type === 'text/xml' || document.mime_type === 'text/html') {
        textContent = await extractStructuredText(fileData, document.mime_type);
      } else {
        console.warn(`⚠️ Unsupported file type: ${document.mime_type}`);
        textContent = await attemptGenericTextExtraction(fileData, document.original_filename, document.mime_type);
      }
    } catch (extractionError) {
      console.error('❌ Text extraction failed:', extractionError);
      textContent = `Document: ${document.original_filename}. Text extraction failed: ${extractionError.message}. Please try converting to PDF or plain text format.`;
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
    
    // Use the already parsed body variable to get documentId
    const finalDocumentId = body?.documentId || 'unknown';
    console.log('📄 Using documentId for error handling:', finalDocumentId);
    
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
      rawText = rawText.replace(new RegExp('[\\x00-\\x1F\\x7F-\\x9F]', 'g'), ' ') // Remove control characters
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

// Text File Extraction
async function extractTextFile(fileData: Blob): Promise<string> {
  try {
    const text = await fileData.text();
    console.log('✅ Text file extracted successfully, length:', text.length);
    return text;
  } catch (error) {
    console.error('❌ Text file extraction error:', error);
    throw new Error(`Text file extraction failed: ${error.message}`);
  }
}

// Spreadsheet Text Extraction (Excel, CSV)
async function extractSpreadsheetText(fileData: Blob, filename: string): Promise<string> {
  try {
    console.log('📊 Processing spreadsheet:', filename);
    
    if (filename.toLowerCase().endsWith('.csv')) {
      // Handle CSV files
      const text = await fileData.text();
      const lines = text.split('\n');
      const processedLines = lines.map(line => {
        return line.split(',').map(cell => cell.replace(/"/g, '').trim()).join(' | ');
      });
      
      const result = `Spreadsheet Data (CSV):\n${processedLines.join('\n')}`;
      console.log('✅ CSV extraction successful, length:', result.length);
      return result;
    } else {
      // For Excel files, we'll use a basic approach to extract readable text
      const arrayBuffer = await fileData.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
      
      // Try to extract readable text patterns from Excel files
      const textMatches = text.match(/[a-zA-Z0-9\s.,;:!?_-]+/g);
      if (textMatches) {
        const extractedText = textMatches
          .filter(match => match.trim().length > 2)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (extractedText.length > 50) {
          console.log('✅ Excel text extraction completed, length:', extractedText.length);
          return `Spreadsheet Content:\n${extractedText}`;
        }
      }
      
      return `Excel spreadsheet: ${filename}. Text extraction was limited. For better results, save as CSV or convert to PDF.`;
    }
  } catch (error) {
    console.error('❌ Spreadsheet extraction error:', error);
    throw new Error(`Spreadsheet extraction failed: ${error.message}`);
  }
}

// Presentation Text Extraction (PowerPoint)
async function extractPresentationText(fileData: Blob, filename: string): Promise<string> {
  try {
    console.log('📽️ Processing presentation:', filename);
    
    const arrayBuffer = await fileData.arrayBuffer();
    
    if (filename.toLowerCase().includes('.pptx')) {
      // Extract text from PowerPoint XML structure
      const text = new TextDecoder().decode(arrayBuffer);
      
      // Look for slide text patterns in PPTX XML
      const textMatches = text.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || text.match(/<t>([^<]*)<\/t>/g);
      if (textMatches) {
        const extractedText = textMatches
          .map(match => match.replace(/<[^>]*>/g, ''))
          .filter(text => text.trim().length > 0)
          .join('\n')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (extractedText.length > 50) {
          console.log('✅ PowerPoint text extraction successful, length:', extractedText.length);
          return `Presentation Content:\n${extractedText}`;
        }
      }
    } else {
      // Basic text extraction for legacy PPT files
      const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
      const textMatches = text.match(/[a-zA-Z0-9\s.,;:!?_-]+/g);
      
      if (textMatches) {
        const extractedText = textMatches
          .filter(match => match.trim().length > 3)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (extractedText.length > 50) {
          console.log('✅ Legacy PowerPoint text extraction completed, length:', extractedText.length);
          return `Presentation Content:\n${extractedText.substring(0, 3000)}`;
        }
      }
    }
    
    return `PowerPoint presentation: ${filename}. Text extraction was limited. For better results, convert to PDF or export slides as text.`;
  } catch (error) {
    console.error('❌ Presentation extraction error:', error);
    throw new Error(`Presentation extraction failed: ${error.message}`);
  }
}

// OpenDocument Text Extraction (ODT, ODS, ODP)
async function extractOpenDocumentText(fileData: Blob, filename: string): Promise<string> {
  try {
    console.log('📄 Processing OpenDocument:', filename);
    
    const arrayBuffer = await fileData.arrayBuffer();
    const text = new TextDecoder().decode(arrayBuffer);
    
    // Extract text from OpenDocument XML structure
    const textMatches = text.match(/<text:p[^>]*>([^<]*)<\/text:p>/g) || 
                       text.match(/<text:span[^>]*>([^<]*)<\/text:span>/g);
    
    if (textMatches) {
      const extractedText = textMatches
        .map(match => match.replace(/<[^>]*>/g, ''))
        .filter(text => text.trim().length > 0)
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (extractedText.length > 50) {
        console.log('✅ OpenDocument text extraction successful, length:', extractedText.length);
        return `OpenDocument Content:\n${extractedText}`;
      }
    }
    
    return `OpenDocument file: ${filename}. Text extraction was limited. For better results, convert to PDF or plain text.`;
  } catch (error) {
    console.error('❌ OpenDocument extraction error:', error);
    throw new Error(`OpenDocument extraction failed: ${error.message}`);
  }
}

// Structured Text Extraction (JSON, XML, HTML)
async function extractStructuredText(fileData: Blob, mimeType: string): Promise<string> {
  try {
    console.log('🔍 Processing structured document:', mimeType);
    
    const text = await fileData.text();
    
    if (mimeType.includes('json')) {
      // Parse and format JSON
      try {
        const jsonData = JSON.parse(text);
        const formattedJson = JSON.stringify(jsonData, null, 2);
        return `JSON Data:\n${formattedJson}`;
      } catch {
        return `JSON file with invalid format. Raw content:\n${text.substring(0, 2000)}`;
      }
    } else if (mimeType.includes('xml') || mimeType.includes('html')) {
      // Extract text content from XML/HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, mimeType.includes('html') ? 'text/html' : 'text/xml');
      const textContent = doc.body?.textContent || doc.documentElement?.textContent || text;
      
      return `${mimeType.includes('html') ? 'HTML' : 'XML'} Content:\n${textContent.replace(/\s+/g, ' ').trim()}`;
    }
    
    return text;
  } catch (error) {
    console.error('❌ Structured text extraction error:', error);
    throw new Error(`Structured text extraction failed: ${error.message}`);
  }
}

// Generic Text Extraction Attempt
async function attemptGenericTextExtraction(fileData: Blob, filename: string, mimeType: string): Promise<string> {
  try {
    console.log('🔄 Attempting generic text extraction for:', filename, mimeType);
    
    // Try to read as text first
    try {
      const text = await fileData.text();
      if (text && text.length > 50) {
        // Filter out mostly binary content
        const readableChars = text.match(/[a-zA-Z0-9\s.,;:!?_-]/g);
        if (readableChars && readableChars.length > text.length * 0.7) {
          console.log('✅ Generic text extraction successful, length:', text.length);
          return `Document Content (${filename}):\n${text}`;
        }
      }
    } catch (textError) {
      console.log('📄 Text extraction failed, trying binary approach...');
    }
    
    // Try binary text extraction
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(uint8Array);
    
    // Extract readable text patterns
    const textMatches = rawText.match(/[a-zA-Z0-9\s.,;:!?_-]{3,}/g);
    if (textMatches && textMatches.length > 0) {
      const extractedText = textMatches
        .filter(match => match.trim().length > 3)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (extractedText.length > 100) {
        console.log('✅ Binary text extraction completed, length:', extractedText.length);
        return `Document Content (${filename}):\n${extractedText.substring(0, 3000)}`;
      }
    }
    
    return `Document: ${filename} (${mimeType}). Unable to extract readable text. Please convert to PDF, Word, or plain text format for better processing.`;
  } catch (error) {
    console.error('❌ Generic extraction error:', error);
    return `Document: ${filename}. File format not supported for text extraction. Please convert to a supported format (PDF, Word, text).`;
  }
}

// Enhanced Image OCR Processing
async function processImageWithOCR(fileData: Blob, filename: string): Promise<string> {
  console.log('📷 Processing image for OCR:', filename);
  
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
                text: 'Extract all text from this image. If this is a hotel document, SOP, policy, or procedure, transcribe it completely preserving structure. If it contains tables, preserve the table structure. Return only the extracted text content.'
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
        max_tokens: 3000
      }),
    });
    
    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    if (extractedText && extractedText.length > 20) {
      console.log('✅ Image OCR completed successfully, length:', extractedText.length);
      return `Image Document Content (${filename}):\n${extractedText}`;
    } else {
      return `Image file: ${filename}. OCR processing completed but minimal text was detected. This may be a non-text image or low-quality scan.`;
    }
  } catch (error) {
    console.error('❌ Image OCR error:', error);
    return `Image file: ${filename}. OCR processing failed: ${error.message}. Please try uploading a clearer image or convert to text format.`;
  }
}
