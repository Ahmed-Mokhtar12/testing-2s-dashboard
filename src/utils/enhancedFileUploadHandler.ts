
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';

export const createEnhancedFileUploadMessage = (file: File): Message => ({
  id: Date.now().toString(),
  content: `📎 I've uploaded "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB). Please wait while I analyze its relevance and process it for our conversation.`,
  isUser: true,
  timestamp: new Date(),
  fileName: file.name,
  fileType: file.type,
});

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

    // Trigger document processing
    const { data: processData, error: processError } = await supabase.functions.invoke('process-document', {
      body: {
        documentId: documentData.id,
        sessionId: sessionId
      }
    });

    if (processError) {
      console.error('⚠️ Processing error:', processError);
      // Continue with basic response even if processing fails
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
          content: `✅ Perfect! I've successfully processed "${file.name}" and found it highly relevant to our hotel operations (${(relevanceScore * 100).toFixed(0)}% relevance). 

${processingResult.reason || 'The document contains valuable information for our conversation.'}

The document has been analyzed and integrated into my knowledge base. I can now provide more accurate and contextual responses based on this new information. Feel free to ask me anything about the content or how it relates to your hotel operations!`,
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
  content: "❌ I encountered an issue with your file upload. Please ensure your file is under 50MB and in a supported format (PDF, Word, images, or text files). You can try uploading again, or ask me any questions directly!",
  isUser: false,
  timestamp: new Date(),
});
