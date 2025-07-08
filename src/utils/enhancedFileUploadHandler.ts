
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';

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

export const processFileUpload = async (file: File): Promise<Message> => {
  try {
    // Generate session ID for tracking
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Upload file to storage
    const filePath = `${sessionId}/${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    console.log('✅ File uploaded to storage:', filePath);

    // Create document record
    const { data: documentData, error: documentError } = await supabase
      .from('uploaded_documents')
      .insert({
        session_id: sessionId,
        original_filename: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        upload_status: 'uploaded'
      })
      .select()
      .single();

    if (documentError || !documentData) {
      throw new Error(`Failed to create document record: ${documentError?.message}`);
    }

    console.log('📄 Document record created:', documentData.id);

    console.log('🔄 Starting document processing...');
    
    // Health check first to ensure function is available
    try {
      const healthCheck = await supabase.functions.invoke('process-document', {
        body: { health: 'check' }
      });
      console.log('📡 Function health check:', healthCheck);
    } catch (healthError) {
      console.error('❌ Function not available:', healthError);
      throw new Error('Document processing service is currently unavailable. Please try again later.');
    }
    
    // Trigger document processing with proper error handling
    const { data: processData, error: processError } = await supabase.functions.invoke('process-document', {
      body: {
        documentId: documentData.id,
        sessionId: sessionId
      }
    });

    if (processError) {
      console.error('❌ Processing function error:', processError);
      // Update document status to failed
      await supabase
        .from('uploaded_documents')
        .update({ 
          upload_status: 'failed',
          processing_error: processError.message || 'Processing function failed'
        })
        .eq('id', documentData.id);
        
      throw new Error(`Document processing failed: ${processError.message}`);
    }

    const processingResult = processData;
    console.log('🔄 Processing result:', processingResult);

    // Create AI response based on processing result
    if (processingResult?.success) {
      const relevanceScore = processingResult.relevanceScore || 0;
      const status = processingResult.status || 'processed';
      
      if (status === 'processed') {
        return {
          id: (Date.now() + 1).toString(),
          content: `✅ تم بنجاح! لقد قمت بمعالجة "${file.name}" بنجاح ووجدته ذا صلة عالية بعمليات الفندق (${(relevanceScore * 100).toFixed(0)}% صلة). 

🔍 تفاصيل المعالجة:
${processingResult.reason || 'يحتوي المستند على معلومات قيمة لمحادثتنا.'}

📋 الوضع الحالي:
• ✅ تم استخراج النص بنجاح
• ✅ تم تحليل المحتوى وتصنيفه  
• ✅ تم دمج المستند في قاعدة المعرفة
• ✅ جاهز للإجابة على الأسئلة

يمكنك الآن أن تسألني أي شيء عن محتوى المستند أو كيف يتعلق بعمليات الفندق! سأركز على تقديم إجابات مفصلة ومدروسة بناءً على محتوى المستند المرفوع.`,
          isUser: false,
          timestamp: new Date(),
        };
      } else {
        return {
          id: (Date.now() + 1).toString(),
          content: `📋 I've reviewed "${file.name}" but determined it has limited relevance to our hotel operations (${(relevanceScore * 100).toFixed(0)}% relevance). 

${processingResult.reason || 'The content may not be directly related to hotel management or guest services.'}

While I won't prioritize this document in our conversation, I'm still here to help you with any hotel-related questions you might have!`,
          isUser: false,
          timestamp: new Date(),
        };
      }
    } else {
      // Fallback response if processing fails
      return {
        id: (Date.now() + 1).toString(),
        content: `📎 I've received your file "${file.name}" successfully. While I'm still learning to process different file types optimally, I'm here to help you with any questions about hotel operations, guest services, or management practices. 

What would you like to discuss about your hotel business?`,
        isUser: false,
        timestamp: new Date(),
      };
    }

  } catch (error) {
    console.error('❌ File upload error:', error);
    
    return {
      id: (Date.now() + 1).toString(),
      content: `❌ I encountered an issue processing your file: ${error instanceof Error ? error.message : 'Unknown error'}. 

Please try uploading again, or feel free to ask me any questions directly. I'm here to help with hotel management, guest services, and operational inquiries!`,
      isUser: false,
      timestamp: new Date(),
    };
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
