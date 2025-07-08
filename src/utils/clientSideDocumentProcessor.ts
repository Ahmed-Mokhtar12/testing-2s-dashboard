import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from '@/integrations/supabase/client';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface DocumentProcessingResult {
  success: boolean;
  documentId?: string;
  text?: string;
  error?: string;
  chunkCount?: number;
}

export interface ProcessingProgress {
  stage: 'extracting' | 'storing' | 'indexing' | 'complete';
  progress: number;
  message: string;
}

export class ClientSideDocumentProcessor {
  private onProgress?: (progress: ProcessingProgress) => void;

  constructor(onProgress?: (progress: ProcessingProgress) => void) {
    this.onProgress = onProgress;
  }

  private updateProgress(stage: ProcessingProgress['stage'], progress: number, message: string) {
    if (this.onProgress) {
      this.onProgress({ stage, progress, message });
    }
  }

  async processDocument(file: File, sessionId: string): Promise<DocumentProcessingResult> {
    try {
      this.updateProgress('extracting', 10, 'بدء استخراج النص من المستند...');
      
      // Extract text based on file type
      let extractedText = '';
      
      if (file.type === 'application/pdf') {
        extractedText = await this.extractPdfText(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                 file.type === 'application/msword') {
        extractedText = await this.extractWordText(file);
      } else if (file.type === 'text/plain') {
        extractedText = await this.extractPlainText(file);
      } else {
        throw new Error(`نوع الملف غير مدعوم: ${file.type}`);
      }

      this.updateProgress('extracting', 40, 'تم استخراج النص بنجاح');

      if (!extractedText.trim()) {
        throw new Error('لم يتم العثور على نص في المستند');
      }

      // Store document metadata
      this.updateProgress('storing', 50, 'حفظ معلومات المستند...');
      
      const { data: documentData, error: docError } = await supabase
        .from('uploaded_documents')
        .insert({
          original_filename: file.name,
          file_path: `client-processed/${Date.now()}-${file.name}`,
          file_size: file.size,
          mime_type: file.type,
          session_id: sessionId,
          upload_status: 'processed',
          processed_at: new Date().toISOString(),
          document_category: 'user_upload'
        })
        .select()
        .single();

      if (docError) {
        throw new Error(`خطأ في حفظ معلومات المستند: ${docError.message}`);
      }

      this.updateProgress('indexing', 70, 'فهرسة محتوى المستند...');

      // Break text into chunks and store in N8N_2S table
      const chunks = this.chunkText(extractedText);
      const chunkPromises = chunks.map(async (chunk, index) => {
        const { error: chunkError } = await supabase
          .from('N8N_2S')
          .insert({
            document_id: documentData.id,
            content: chunk,
            chunk_index: index,
            is_recent_context: true,
            metadata: {
              filename: file.name,
              file_type: file.type,
              chunk_size: chunk.length,
              total_chunks: chunks.length,
              processed_client_side: true
            }
          });

        if (chunkError) {
          console.error('خطأ في حفظ جزء من النص:', chunkError);
        }
      });

      await Promise.all(chunkPromises);

      // Update document with chunk count
      await supabase
        .from('uploaded_documents')
        .update({ 
          chunk_count: chunks.length,
          last_accessed: new Date().toISOString()
        })
        .eq('id', documentData.id);

      this.updateProgress('complete', 100, 'تم معالجة المستند بنجاح');

      return {
        success: true,
        documentId: documentData.id,
        text: extractedText,
        chunkCount: chunks.length
      };

    } catch (error) {
      console.error('خطأ في معالجة المستند:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'خطأ غير معروف في معالجة المستند'
      };
    }
  }

  private async extractPdfText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    try {
      const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
      let text = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');
        text += pageText + '\n';
      }
      
      return text.trim();
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      throw new Error('فشل في استخراج النص من ملف PDF');
    }
  }

  private async extractWordText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  private async extractPlainText(file: File): Promise<string> {
    return await file.text();
  }

  private chunkText(text: string, maxChunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      if (currentChunk.length + trimmedSentence.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [text];
  }
}