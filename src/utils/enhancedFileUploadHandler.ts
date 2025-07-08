
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';
import { ClientSideDocumentProcessor, ProcessingProgress } from './clientSideDocumentProcessor';

export const createEnhancedFileUploadMessage = (file: File): Message => {
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

  return {
    id: Date.now().toString(),
    content: `📎 Uploading "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB)...

📋 File Type: ${getFileTypeDescription(file.type, file.name)}

🔄 Processing status:
• ✅ File uploaded to storage
• 🔄 Extracting text content using advanced processing...
• ⏳ Analyzing relevance for hotel operations...
• ⏳ Integrating into knowledge base...

⚡ Enhanced support for: PDF, Word, Excel, PowerPoint, OpenDocument, Images, Text files, and more!

Please wait while I analyze and process your document.`,
    isUser: true,
    timestamp: new Date(),
    fileName: file.name,
    fileType: file.type,
  };
};

export const processFileUpload = async (
  file: File, 
  sessionId?: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Message> => {
  console.log('📎 Client-side file processing started:', file.name, file.type, file.size);
  
  try {
    const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Use client-side document processor
    const processor = new ClientSideDocumentProcessor(onProgress);
    const result = await processor.processDocument(file, currentSessionId);

    if (!result.success) {
      throw new Error(result.error || 'فشل في معالجة المستند');
    }

    console.log('✅ Client-side processing completed:', result);
    
    // Create success message with document analysis
    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: `✅ تم تحليل المستند "${file.name}" بنجاح! 📄

📊 **تفاصيل المعالجة:**
- تم استخراج ${result.text?.length || 0} حرف من النص
- تم تقسيم المحتوى إلى ${result.chunkCount || 0} أجزاء للفهرسة
- تمت المعالجة محلياً في المتصفح

💡 **ما يمكنني فعله الآن:**
- الإجابة على أسئلة حول محتوى المستند
- تلخيص المعلومات الرئيسية
- البحث في النص المستخرج
- مقارنة المحتوى مع بيانات الفندق الأخرى

يمكنك الآن طرح أي سؤال عن محتوى هذا المستند وسأكون قادراً على الإجابة بناءً على المعلومات المستخرجة.`,
      isUser: false,
      timestamp: new Date(),
      fileName: file.name,
      fileType: file.type,
    };

    return aiMessage;

  } catch (error) {
    console.error('❌ Client-side file processing error:', error);
    
    // Return error message
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: `حدث خطأ أثناء معالجة المستند "${file.name}": ${error instanceof Error ? error.message : 'خطأ غير معروف'}

يرجى المحاولة مرة أخرى أو التأكد من أن المستند في تنسيق مدعوم (PDF، Word، أو نص عادي).`,
      isUser: false,
      timestamp: new Date(),
      fileName: file.name,
      fileType: file.type,
    };

    return errorMessage;
  }
};

export const createFileUploadErrorMessage = (): Message => ({
  id: (Date.now() + 1).toString(),
  content: `❌ I encountered an issue with your file upload. Please ensure your file is under 50MB and in a supported format.

📋 Supported formats:
• PDF documents
• Word documents (.doc, .docx)
• Excel spreadsheets (.xls, .xlsx, .csv)
• PowerPoint presentations (.ppt, .pptx)
• OpenDocument files (.odt, .ods, .odp)
• Images (JPG, PNG, etc.) with OCR
• Text files (.txt, .rtf)
• Structured files (JSON, XML, HTML)

You can try uploading again, or ask me any questions directly about hotel operations!`,
  isUser: false,
  timestamp: new Date(),
});
