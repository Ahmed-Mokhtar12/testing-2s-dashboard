import { Message } from '@/types/chat';
// TYPE-ONLY, and the `type` keyword is load-bearing. clientSideDocumentProcessor
// statically imports pdfjs-dist and mammoth, whose dependency trees together came
// to ~820 kB minified. This module is reached from the entry chunk
// (App -> DashboardShell -> RightChatPanel -> useChat -> useFileUpload), so a
// plain value import here put all of it in the bundle downloaded before ANYTHING
// renders — including /auth, where no document can be uploaded at all. The class
// is now pulled in on demand, in processFileUpload below.
import type { ProcessingProgress } from './clientSideDocumentProcessor';

const createMessageId = () => crypto.randomUUID();

const getFileTypeDescription = (type: string, name: string) => {
  if (type.includes('pdf')) return 'PDF document';
  if (type.includes('word') || type.includes('officedocument.wordprocessingml')) return 'Word document';
  if (type.includes('excel') || type.includes('spreadsheetml') || name.endsWith('.csv')) return 'Spreadsheet';
  if (type.includes('powerpoint') || type.includes('presentationml')) return 'Presentation';
  if (type.includes('opendocument')) return 'OpenDocument';
  if (type.includes('image/')) return 'Image document (OCR)';
  if (type.includes('text/')) return 'Text document';
  return 'Document';
};

export const createEnhancedFileUploadMessage = (file: File): Message => ({
  id: createMessageId(),
  content: `Uploading "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB)...

File type: ${getFileTypeDescription(file.type, file.name)}

Processing status:
- File uploaded to storage
- Extracting text content
- Analyzing relevance for hotel operations
- Integrating into the knowledge base

Please wait while the document is analyzed.`,
  isUser: true,
  timestamp: new Date(),
  fileName: file.name,
  fileType: file.type,
});

export const processFileUpload = async (
  file: File,
  sessionId?: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Message> => {
  const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  // Loaded here rather than at module scope: this is the only place the parser is
  // used, and by the time we get here the user has already picked a file, so a
  // one-off chunk fetch is invisible next to reading and parsing the document.
  const { ClientSideDocumentProcessor } = await import('./clientSideDocumentProcessor');
  const processor = new ClientSideDocumentProcessor(onProgress);
  const result = await processor.processDocument(file, currentSessionId);

  if (!result.success) {
    throw new Error(result.error || 'Failed to process the uploaded document');
  }

  return {
    id: createMessageId(),
    content: `Document "${file.name}" was analyzed successfully.

Processing details:
- Extracted ${result.text?.length || 0} characters of text
- Split the content into ${result.chunkCount || 0} searchable chunks
- Finished processing in the browser

You can now ask questions about this document, request a summary, or search its contents.`,
    isUser: false,
    timestamp: new Date(),
    fileName: file.name,
    fileType: file.type,
  };
};

export const createFileUploadErrorMessage = (): Message => ({
  id: createMessageId(),
  content: `I ran into an issue while processing the file. Please make sure it is under 50MB and in a supported format.

Supported formats:
- PDF documents
- Word documents (.doc, .docx)
- Excel spreadsheets (.xls, .xlsx, .csv)
- PowerPoint presentations (.ppt, .pptx)
- OpenDocument files (.odt, .ods, .odp)
- Images (JPG, PNG, and similar)
- Text files (.txt, .rtf)
- Structured files (JSON, XML, HTML)`,
  isUser: false,
  timestamp: new Date(),
});
