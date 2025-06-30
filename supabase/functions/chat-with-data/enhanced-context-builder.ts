
export class EnhancedContextBuilder {
  buildContextWithDocuments(data: any, userMessage: string): string {
    const contextSections: string[] = [];

    // Priority 1: Recent Document Context (highest priority)
    if (data.documentContext?.status === 'fulfilled' && data.documentContext.value.data?.length > 0) {
      contextSections.push('📄 RECENT DOCUMENT CONTEXT (Priority Information):');
      data.documentContext.value.data.forEach((doc: any, index: number) => {
        contextSections.push(`${index + 1}. [${doc.document_category?.toUpperCase()}] ${doc.document_filename}`);
        contextSections.push(`   Relevance: ${(doc.relevance_score * 100).toFixed(0)}%`);
        contextSections.push(`   Content: ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}`);
        contextSections.push('');
      });
    }

    // Priority 2: Recent Documents Metadata
    if (data.recentDocuments?.status === 'fulfilled' && data.recentDocuments.value.data?.length > 0) {
      contextSections.push('🗂️ RECENTLY ACCESSED DOCUMENTS:');
      data.recentDocuments.value.data.forEach((doc: any) => {
        contextSections.push(`• ${doc.original_filename} (${doc.document_category}) - Relevance: ${(doc.relevance_score * 100).toFixed(0)}%`);
        if (doc.relevance_reason) {
          contextSections.push(`  Reason: ${doc.relevance_reason}`);
        }
      });
      contextSections.push('');
    }

    // Priority 3: Long-term memory for conversation continuity
    if (data.longTermMemory?.status === 'fulfilled' && data.longTermMemory.value.data?.length > 0) {
      contextSections.push('🧠 CONVERSATION MEMORY:');
      data.longTermMemory.value.data.slice(0, 5).forEach((memory: any) => {
        if (memory.message) {
          contextSections.push(`• ${memory.message.substring(0, 200)}${memory.message.length > 200 ? '...' : ''}`);
        }
      });
      contextSections.push('');
    }

    // Priority 4: Hotel Reviews (relevant to guest experience)
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      contextSections.push('⭐ HOTEL REVIEWS SUMMARY:');
      data.hotelReviews.value.data.slice(0, 3).forEach((review: any) => {
        if (review['Reviews Summary']) {
          contextSections.push(`• ${review['Reviews Summary'].substring(0, 150)}...`);
        }
      });
      contextSections.push('');
    }

    // Priority 5: Recent Chat History
    if (data.chatHistory?.status === 'fulfilled' && data.chatHistory.value.data?.length > 0) {
      contextSections.push('💬 RECENT CHAT INTERACTIONS:');
      data.chatHistory.value.data.slice(0, 3).forEach((chat: any) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          contextSections.push(`Q: ${chat['Sender Message'].substring(0, 100)}...`);
          contextSections.push(`A: ${chat['Ai Reply'].substring(0, 100)}...`);
        }
      });
      contextSections.push('');
    }

    // Priority 6: Training Materials and Info Summary
    if (data.conductedTraining?.status === 'fulfilled' && data.conductedTraining.value.data?.length > 0) {
      contextSections.push('🎓 STAFF TRAINING MATERIALS:');
      data.conductedTraining.value.data.slice(0, 2).forEach((training: any) => {
        if (training['Summary of the training']) {
          contextSections.push(`• ${training['Summary of the training'].substring(0, 120)}...`);
        }
      });
      contextSections.push('');
    }

    if (data.infoSummary?.status === 'fulfilled' && data.infoSummary.value.data?.length > 0) {
      contextSections.push('📧 COMMUNICATION SUMMARIES:');
      data.infoSummary.value.data.slice(0, 2).forEach((info: any) => {
        if (info['Email Summary']) {
          contextSections.push(`• From: ${info['From'] || 'Unknown'} | ${info['Email Summary'].substring(0, 100)}...`);
        }
      });
      contextSections.push('');
    }

    // Priority 7: Vector search data (if available)
    if (data.vectorSearch?.status === 'fulfilled' && data.vectorSearch.value.data?.length > 0) {
      contextSections.push('🔍 ADDITIONAL CONTEXT:');
      data.vectorSearch.value.data.slice(0, 2).forEach((item: any) => {
        if (item.content) {
          contextSections.push(`• ${item.content.substring(0, 100)}...`);
        }
      });
    }

    const context = contextSections.join('\n');
    
    console.log('🏗️ Built enhanced context with document priority, length:', context.length);
    return context;
  }

  private determineContextRelevance(userMessage: string, data: any): string {
    const messageLower = userMessage.toLowerCase();
    
    // Determine which context is most relevant based on user message
    if (messageLower.includes('review') || messageLower.includes('guest') || messageLower.includes('feedback')) {
      return 'reviews';
    } else if (messageLower.includes('train') || messageLower.includes('staff') || messageLower.includes('procedure')) {
      return 'training';
    } else if (messageLower.includes('document') || messageLower.includes('file') || messageLower.includes('upload')) {
      return 'documents';
    } else {
      return 'general';
    }
  }
}
