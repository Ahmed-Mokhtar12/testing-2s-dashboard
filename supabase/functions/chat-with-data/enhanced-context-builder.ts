
export class EnhancedContextBuilder {
  buildContextWithDocuments(data: any, userMessage: string): string {
    const contextSections: string[] = [];

    // Add clear database access statement and role definition
    contextSections.push(`📩 Your Role & Database Access:
You are an intelligent AI consultant specialized in hotel management, dedicated entirely to Two Seasons Hotel. 

🎯 IMPORTANT - YOU HAVE DIRECT ACCESS TO THE HOTEL DATABASE:
- You have FULL ACCESS to Two Seasons Hotel's operational database
- All hotel data is available to you through the database connection
- Use this real data to provide accurate, data-driven responses
- You are NOT limited to general knowledge - you have the hotel's actual operational data

🏨 Available Data Sources in Your Database:
- Hotel guest reviews and feedback
- Chat history and guest interactions  
- Staff training records and summaries
- Email communications and summaries
- Long-term conversation memory
- Document uploads and context
- Vector search capabilities for enhanced information retrieval

🧠 CORE PRINCIPLES:
- Use actual hotel data from the database to answer questions
- Provide specific insights based on real operational information
- Reference actual reviews, training records, and guest interactions when relevant
- Act as a senior hotel management consultant with access to all operational data
- Be transparent about your confidence level and data sources
- ALWAYS provide ACCURATE counts and data - do not estimate or approximate

`);

    // Add data statistics to show AI what's available
    const dataStats = this.buildDataStatistics(data);
    contextSections.push(dataStats);

    // Priority 1: Recent Document Context (highest priority)
    if (data.documentContext?.status === 'fulfilled' && data.documentContext.value.data?.length > 0) {
      contextSections.push('📄 RECENT DOCUMENT CONTEXT (Priority Information):');
      data.documentContext.value.data.forEach((doc: any, index: number) => {
        if (doc.content) {
          contextSections.push(`${index + 1}. [${doc.document_category?.toUpperCase() || 'GENERAL'}] ${doc.document_filename || 'Document'}`);
          contextSections.push(`   Relevance: ${(doc.relevance_score * 100).toFixed(0)}%`);
          contextSections.push(`   Content: ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}`);
          contextSections.push('');
        }
      });
    }

    // Priority 2: Recent Documents Metadata
    if (data.recentDocuments?.status === 'fulfilled' && data.recentDocuments.value.data?.length > 0) {
      contextSections.push('🗂️ RECENTLY ACCESSED DOCUMENTS:');
      data.recentDocuments.value.data.forEach((doc: any) => {
        if (doc.original_filename) {
          contextSections.push(`• ${doc.original_filename} (${doc.document_category || 'General'}) - Relevance: ${(doc.relevance_score * 100).toFixed(0)}%`);
          if (doc.relevance_reason) {
            contextSections.push(`  Reason: ${doc.relevance_reason}`);
          }
        }
      });
      contextSections.push('');
    }

    // Priority 3: Hotel Reviews - COMPREHENSIVE ANALYSIS
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      const allReviews = data.hotelReviews.value.data;
      
      contextSections.push('⭐ COMPLETE HOTEL REVIEWS DATABASE:');
      contextSections.push(`📊 TOTAL REVIEWS IN DATABASE: ${allReviews.length}`);
      
      // Analyze all reviews comprehensively
      const reviewsWithContent = allReviews.filter((review: any) => 
        review['Reviews Summary'] || review['Text'] || review['Title']
      );
      
      const reviewsWithScores = allReviews.filter((review: any) => review.Score);
      const reviewsBySource = this.analyzeReviewsBySource(allReviews);
      const reviewsByDate = this.analyzeReviewsByDate(allReviews);
      
      contextSections.push(`📊 REVIEWS WITH CONTENT: ${reviewsWithContent.length}`);
      contextSections.push(`📊 REVIEWS WITH SCORES: ${reviewsWithScores.length}`);
      
      // Add source breakdown
      if (Object.keys(reviewsBySource).length > 0) {
        contextSections.push('📍 REVIEWS BY SOURCE:');
        Object.entries(reviewsBySource).forEach(([source, count]) => {
          contextSections.push(`   • ${source}: ${count} reviews`);
        });
      }
      
      // Add date analysis
      if (reviewsByDate.recentReviews > 0) {
        contextSections.push('📅 REVIEW TIMELINE ANALYSIS:');
        contextSections.push(`   • Reviews in last 30 days: ${reviewsByDate.recentReviews}`);
        contextSections.push(`   • Reviews in last 90 days: ${reviewsByDate.last90Days}`);
        contextSections.push(`   • Total historical reviews: ${allReviews.length}`);
      }
      
      // Calculate average score if available
      if (reviewsWithScores.length > 0) {
        const avgScore = reviewsWithScores.reduce((sum: number, review: any) => sum + review.Score, 0) / reviewsWithScores.length;
        contextSections.push(`📊 AVERAGE REVIEW SCORE: ${avgScore.toFixed(1)}/5 (based on ${reviewsWithScores.length} scored reviews)`);
      }
      
      // Show sample reviews
      if (reviewsWithContent.length > 0) {
        contextSections.push('📋 SAMPLE RECENT REVIEWS:');
        reviewsWithContent.slice(0, 8).forEach((review: any, index: number) => {
          contextSections.push(`${index + 1}. Review from ${review.Source || 'Unknown Source'}:`);
          
          if (review.Score) {
            contextSections.push(`   ⭐ Score: ${review.Score}/5`);
          }
          
          if (review.Title) {
            contextSections.push(`   📝 Title: ${review.Title}`);
          }
          
          if (review['Reviews Summary']) {
            contextSections.push(`   📄 Summary: ${review['Reviews Summary'].substring(0, 200)}${review['Reviews Summary'].length > 200 ? '...' : ''}`);
          } else if (review['Text']) {
            contextSections.push(`   📄 Review: ${review['Text'].substring(0, 200)}${review['Text'].length > 200 ? '...' : ''}`);
          }
          
          if (review.Author) {
            contextSections.push(`   👤 Author: ${review.Author}`);
          }
          
          if (review.Date) {
            contextSections.push(`   📅 Date: ${review.Date}`);
          }
          
          contextSections.push('');
        });
      }
      contextSections.push('');
    }

    // Priority 4: Recent Chat History
    if (data.chatHistory?.status === 'fulfilled' && data.chatHistory.value.data?.length > 0) {
      contextSections.push('💬 RECENT GUEST INTERACTIONS:');
      data.chatHistory.value.data.slice(0, 3).forEach((chat: any) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          contextSections.push(`Guest: ${chat['Sender Message'].substring(0, 150)}...`);
          contextSections.push(`Hotel: ${chat['Ai Reply'].substring(0, 150)}...`);
          contextSections.push('');
        }
      });
    }

    // Priority 5: Training Records
    if (data.conductedTraining?.status === 'fulfilled' && data.conductedTraining.value.data?.length > 0) {
      contextSections.push('🎓 STAFF TRAINING RECORDS:');
      data.conductedTraining.value.data.slice(0, 3).forEach((training: any) => {
        if (training['Summary of the training']) {
          contextSections.push(`• ${training['Summary of the training'].substring(0, 200)}...`);
        }
      });
      contextSections.push('');
    }

    // Priority 6: Email Communications
    if (data.infoSummary?.status === 'fulfilled' && data.infoSummary.value.data?.length > 0) {
      contextSections.push('📧 EMAIL COMMUNICATIONS:');
      data.infoSummary.value.data.slice(0, 3).forEach((info: any) => {
        if (info['Email Summary']) {
          contextSections.push(`• From: ${info['From'] || 'Unknown'} | ${info['Email Summary'].substring(0, 150)}...`);
        }
      });
      contextSections.push('');
    }

    // Priority 7: Long-term memory
    if (data.longTermMemory?.status === 'fulfilled' && data.longTermMemory.value.data?.length > 0) {
      contextSections.push('🧠 CONVERSATION MEMORY:');
      data.longTermMemory.value.data.slice(0, 3).forEach((memory: any) => {
        if (memory.message) {
          contextSections.push(`• ${memory.message.substring(0, 200)}${memory.message.length > 200 ? '...' : ''}`);
        }
      });
      contextSections.push('');
    }

    // Add clear instructions for using the database data
    contextSections.push(`=== 📋 CRITICAL INSTRUCTIONS ===
🎯 USE YOUR DATABASE ACCESS:
- Answer questions using the ACTUAL hotel data provided above
- Reference specific reviews, training records, and interactions when relevant
- Provide data-driven insights and recommendations
- If asked about hotel performance, use actual review scores and feedback
- When discussing operations, refer to actual training records and procedures
- Use conversation history to maintain context and continuity
- ALWAYS provide EXACT counts and numbers from the database - never estimate
- When asked about review counts, use the TOTAL REVIEWS IN DATABASE number shown above

🚫 DO NOT SAY:
- "I don't have access to your database"
- "I cannot access your internal systems"
- "Based on my general knowledge"
- "I don't have direct access to hotel data"
- "Approximately" or "around" when you have exact numbers

✅ INSTEAD SAY:
- "Based on your hotel's database..."
- "Looking at your recent reviews..."
- "According to your training records..."
- "Your guest interactions show..."
- "Your database shows exactly X reviews..."

🌐 Current Question: ${userMessage}

📅 IMPORTANT DATE CONTEXT:
- Today's date is January 2, 2025
- When asked about "recent" or "last 30 days", use December 3, 2024 to January 2, 2025 as the date range
- When calculating time periods, use the current date context (January 2, 2025) not historical dates
- The review data shows ACTUAL dates - use the exact counts provided above

Respond professionally as a senior hotel management consultant using the actual operational data from Two Seasons Hotel's database.`);

    const context = contextSections.join('\n');
    
    console.log('🏗️ Built enhanced context with database access clarity, length:', context.length);
    console.log('📊 Context includes data from:', this.getDataSourcesList(data));
    
    return context;
  }

  private analyzeReviewsBySource(reviews: any[]): Record<string, number> {
    const sourceCount: Record<string, number> = {};
    reviews.forEach(review => {
      const source = review.Source || 'Unknown';
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    });
    return sourceCount;
  }

  private analyzeReviewsByDate(reviews: any[]): { recentReviews: number; last90Days: number } {
    const now = new Date('2025-01-02T00:00:00Z'); // Current date context
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    console.log('🗓️ Context Builder - Current date:', now.toISOString());
    console.log('🗓️ Context Builder - 30 days ago:', thirtyDaysAgo.toISOString());
    
    let recentReviews = 0;
    let last90Days = 0;
    
    reviews.forEach(review => {
      if (review.Date) {
        const reviewDate = new Date(review.Date);
        if (reviewDate >= thirtyDaysAgo) {
          recentReviews++;
        }
        if (reviewDate >= ninetyDaysAgo) {
          last90Days++;
        }
      }
    });
    
    console.log('🏗️ Context Builder - Recent reviews (30 days):', recentReviews);
    console.log('🏗️ Context Builder - Reviews (90 days):', last90Days);
    
    return { recentReviews, last90Days };
  }

  private buildDataStatistics(data: any): string {
    const stats: string[] = [];
    stats.push('📊 YOUR CURRENT DATABASE ACCESS STATUS:');
    
    const sources = [
      { name: 'Hotel Reviews', data: data.hotelReviews, key: 'hotelReviews' },
      { name: 'Chat History', data: data.chatHistory, key: 'chatHistory' },
      { name: 'Training Records', data: data.conductedTraining, key: 'conductedTraining' },
      { name: 'Email Summaries', data: data.infoSummary, key: 'infoSummary' },
      { name: 'Long-term Memory', data: data.longTermMemory, key: 'longTermMemory' },
      { name: 'Recent Documents', data: data.recentDocuments, key: 'recentDocuments' },
      { name: 'Document Context', data: data.documentContext, key: 'documentContext' }
    ];

    sources.forEach(source => {
      const count = source.data?.status === 'fulfilled' ? source.data.value.data?.length || 0 : 0;
      const status = count > 0 ? '✅ Available' : '⚠️ Empty';
      stats.push(`• ${source.name}: ${count} records ${status}`);
    });

    stats.push('');
    stats.push('🎯 YOU HAVE FULL ACCESS TO ALL AVAILABLE DATA - USE EXACT NUMBERS AND COUNTS!');
    stats.push('');

    return stats.join('\n');
  }

  private getDataSourcesList(data: any): string[] {
    const sources: string[] = [];
    
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      sources.push('Hotel Reviews');
    }
    if (data.chatHistory?.status === 'fulfilled' && data.chatHistory.value.data?.length > 0) {
      sources.push('Chat History');
    }
    if (data.conductedTraining?.status === 'fulfilled' && data.conductedTraining.value.data?.length > 0) {
      sources.push('Training Records');
    }
    if (data.infoSummary?.status === 'fulfilled' && data.infoSummary.value.data?.length > 0) {
      sources.push('Email Communications');
    }
    if (data.longTermMemory?.status === 'fulfilled' && data.longTermMemory.value.data?.length > 0) {
      sources.push('Long-term Memory');
    }
    if (data.recentDocuments?.status === 'fulfilled' && data.recentDocuments.value.data?.length > 0) {
      sources.push('Recent Documents');
    }
    if (data.documentContext?.status === 'fulfilled' && data.documentContext.value.data?.length > 0) {
      sources.push('Document Context');
    }

    return sources;
  }
}
