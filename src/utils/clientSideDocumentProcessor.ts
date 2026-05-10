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
      this.updateProgress('extracting', 10, 'Starting document text extraction...');

      let extractedText = '';

      if (file.type === 'application/pdf') {
        extractedText = await this.extractPdfText(file);
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/msword'
      ) {
        extractedText = await this.extractWordText(file);
      } else if (file.type === 'text/plain') {
        extractedText = await this.extractPlainText(file);
      } else {
        throw new Error(`Unsupported file type: ${file.type}`);
      }

      this.updateProgress('extracting', 40, 'Text extracted successfully');

      if (!extractedText.trim()) {
        throw new Error('No text was found in the uploaded document');
      }

      const documentId = crypto.randomUUID();

      this.updateProgress('storing', 50, 'Saving document metadata...');
      this.updateProgress('indexing', 70, 'Indexing document content...');

      const chunks = this.chunkText(extractedText);
      const chunkPromises = chunks.map(async (chunk, index) => {
        const { error: chunkError } = await supabase
          .from('N8N_2S')
          .insert({
            document_id: documentId,
            content: chunk,
            chunk_index: index,
            is_recent_context: true,
            metadata: {
              filename: file.name,
              file_type: file.type,
              chunk_size: chunk.length,
              total_chunks: chunks.length,
              processed_client_side: true,
              session_id: sessionId,
            },
          });

        if (chunkError) {
          throw new Error(`Failed to store document chunk ${index + 1}: ${chunkError.message}`);
        }
      });

      await Promise.all(chunkPromises);

      this.updateProgress('complete', 100, 'Document processed successfully');

      return {
        success: true,
        documentId,
        text: extractedText,
        chunkCount: chunks.length,
      };
    } catch (error) {
      if (import.meta.env.DEV) console.error('Document processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error while processing the document',
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
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        text += `${pageText}\n`;
      }

      return text.trim();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error extracting PDF text:', error);
      throw new Error('Failed to extract text from PDF');
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
    const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim());

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

      currentChunk += `${currentChunk ? '. ' : ''}${trimmedSentence}`;
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }
}
