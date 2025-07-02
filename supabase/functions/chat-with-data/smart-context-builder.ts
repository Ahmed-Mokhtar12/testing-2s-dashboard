import { QueryAnalysis } from './query-analyzer.ts';
import { ReviewAnalysisUtils } from './review-analysis-utils.ts';
import { ContextLengthManager } from './context-length-manager.ts';

export class SmartContextBuilder {
  buildOptimizedContext(data: any, queryAnalysis: QueryAnalysis, userMessage: string): string {
    console.log('🧠 Smart Context Builder - Query Analysis:', queryAnalysis);
    
    const contextSections: string[] = [];
    
    // Add role definition (always needed but keep brief)
    contextSections.push(this.buildBriefRoleSection());
    
    // Build query-specific context
    switch (queryAnalysis.type) {
      case 'monthly_data':
        contextSections.push(...this.buildMonthlyDataContext(data, queryAnalysis));
        break;
      case 'recent_activity':
        contextSections.push(...this.buildRecentActivityContext(data));
        break;
      case 'review_summary':
        contextSections.push(...this.buildReviewSummaryContext(data));
        break;
      case 'training':
        contextSections.push(...this.buildTrainingContext(data));
        break;
      case 'documents':
        contextSections.push(...this.buildDocumentContext(data));
        break;
      default:
        contextSections.push(...this.buildGeneralContext(data));
    }
    
    // Add query-specific instructions
    contextSections.push(this.buildQueryInstructions(queryAnalysis, userMessage));
    
    const rawContext = contextSections.join('\n');
    console.log('📏 Smart Context - Raw length:', rawContext.length, 'characters');
    console.log('🎯 Smart Context - Query type:', queryAnalysis.type);
    
    // Apply context length management
    const optimizedContext = ContextLengthManager.optimizeContext(rawContext);
    console.log('✅ Smart Context - Final optimized length:', optimizedContext.length, 'characters');
    
    return optimizedContext;
  }
  
  private buildBriefRoleSection(): string {
    return `🏨 You are Two Seasons Hotel's AI consultant with direct database access.
📊 You have real operational data and should provide accurate, data-driven responses.

`;
  }
  
  private buildMonthlyDataContext(data: any, queryAnalysis: QueryAnalysis): string[] {
    const sections: string[] = [];
    
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      const allReviews = data.hotelReviews.value.data;
      const monthlyBreakdown = ReviewAnalysisUtils.analyzeReviewsByMonth(allReviews);
      
      // CRITICAL: Put specific month data at the very top
      if (queryAnalysis.specificMonth && queryAnalysis.specificYear) {
        const monthKey = `${queryAnalysis.specificYear}-${queryAnalysis.specificMonth}`;
        const specificMonthCount = monthlyBreakdown[monthKey] || 0;
        
        sections.push(`🎯 IMMEDIATE ANSWER - ${this.getMonthName(queryAnalysis.specificMonth)} ${queryAnalysis.specificYear}:`);
        sections.push(`📊 TOTAL REVIEWS: ${specificMonthCount}`);
        sections.push(`📅 DATABASE CONTAINS: ${specificMonthCount} reviews for ${this.getMonthName(queryAnalysis.specificMonth)} ${queryAnalysis.specificYear}`);
        sections.push('');
        
        // Add sample reviews from that specific month
        if (specificMonthCount > 0) {
          const specificReviews = allReviews.filter((review: any) => 
            review.Date && review.Date.toString().startsWith(monthKey)
          );
          
          sections.push(`📋 SAMPLE ${this.getMonthName(queryAnalysis.specificMonth)} ${queryAnalysis.specificYear} REVIEWS:`);
          specificReviews.slice(0, 3).forEach((review: any, index: number) => {
            sections.push(`${index + 1}. Score: ${review.Score || 'N/A'} | Date: ${review.Date}`);
            if (review.Title) sections.push(`   Title: ${review.Title}`);
            if (review['Reviews Summary']) {
              sections.push(`   Summary: ${review['Reviews Summary'].substring(0, 150)}...`);
            }
            sections.push('');
          });
        }
      }
      
      // Add complete monthly breakdown for context
      sections.push('📅 COMPLETE MONTHLY BREAKDOWN:');
      Object.entries(monthlyBreakdown).forEach(([monthKey, count]) => {
        const [year, month] = monthKey.split('-');
        const monthName = this.getMonthName(month);
        sections.push(`   • ${monthName} ${year}: ${count} reviews`);
      });
      sections.push('');
      
      // Add total for context
      sections.push(`📊 TOTAL REVIEWS IN DATABASE: ${allReviews.length}`);
      sections.push('');
    }
    
    return sections;
  }
  
  private buildRecentActivityContext(data: any): string[] {
    const sections: string[] = [];
    
    // Recent reviews
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      const recentAnalysis = ReviewAnalysisUtils.analyzeReviewsByDate(data.hotelReviews.value.data);
      sections.push('📅 RECENT ACTIVITY SUMMARY:');
      sections.push(`   • Last 30 days: ${recentAnalysis.recentReviews} reviews`);
      sections.push(`   • Last 90 days: ${recentAnalysis.last90Days} reviews`);
      sections.push('');
    }
    
    // Recent chat history
    if (data.chatHistory?.status === 'fulfilled' && data.chatHistory.value.data?.length > 0) {
      sections.push('💬 RECENT GUEST INTERACTIONS:');
      data.chatHistory.value.data.slice(0, 2).forEach((chat: any) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          sections.push(`Guest: ${chat['Sender Message'].substring(0, 100)}...`);
          sections.push(`Hotel: ${chat['Ai Reply'].substring(0, 100)}...`);
          sections.push('');
        }
      });
    }
    
    return sections;
  }
  
  private buildReviewSummaryContext(data: any): string[] {
    const sections: string[] = [];
    
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      const allReviews = data.hotelReviews.value.data;
      const reviewsWithScores = allReviews.filter((review: any) => review.Score);
      
      sections.push('⭐ REVIEW SUMMARY:');
      sections.push(`📊 Total Reviews: ${allReviews.length}`);
      
      if (reviewsWithScores.length > 0) {
        const avgScore = reviewsWithScores.reduce((sum: number, review: any) => sum + review.Score, 0) / reviewsWithScores.length;
        sections.push(`📊 Average Score: ${avgScore.toFixed(1)}/5`);
      }
      
      // Source breakdown
      const sourceBreakdown = ReviewAnalysisUtils.analyzeReviewsBySource(allReviews);
      sections.push('📍 Reviews by Source:');
      Object.entries(sourceBreakdown).forEach(([source, count]) => {
        sections.push(`   • ${source}: ${count} reviews`);
      });
      sections.push('');
    }
    
    return sections;
  }
  
  private buildTrainingContext(data: any): string[] {
    const sections: string[] = [];
    
    if (data.conductedTraining?.status === 'fulfilled' && data.conductedTraining.value.data?.length > 0) {
      sections.push('🎓 STAFF TRAINING RECORDS:');
      data.conductedTraining.value.data.slice(0, 3).forEach((training: any, index: number) => {
        if (training['Summary of the training']) {
          sections.push(`${index + 1}. ${training['Summary of the training'].substring(0, 200)}...`);
          sections.push('');
        }
      });
    }
    
    return sections;
  }
  
  private buildDocumentContext(data: any): string[] {
    const sections: string[] = [];
    
    if (data.documentContext?.status === 'fulfilled' && data.documentContext.value.data?.length > 0) {
      sections.push('📄 RECENT DOCUMENTS:');
      data.documentContext.value.data.slice(0, 3).forEach((doc: any, index: number) => {
        sections.push(`${index + 1}. ${doc.document_filename || 'Document'} (${doc.document_category || 'General'})`);
        if (doc.content) {
          sections.push(`   Content: ${doc.content.substring(0, 200)}...`);
        }
        sections.push('');
      });
    }
    
    return sections;
  }
  
  private buildGeneralContext(data: any): string[] {
    const sections: string[] = [];
    
    // Brief overview of available data
    const dataSources = [];
    if (data.hotelReviews?.status === 'fulfilled') dataSources.push(`${data.hotelReviews.value.data?.length || 0} reviews`);
    if (data.chatHistory?.status === 'fulfilled') dataSources.push(`${data.chatHistory.value.data?.length || 0} chat records`);
    if (data.conductedTraining?.status === 'fulfilled') dataSources.push(`${data.conductedTraining.value.data?.length || 0} training records`);
    
    sections.push('📊 AVAILABLE DATA:');
    sections.push(`   • ${dataSources.join(', ')}`);
    sections.push('');
    
    return sections;
  }
  
  private buildQueryInstructions(queryAnalysis: QueryAnalysis, userMessage: string): string {
    let instructions = '\n=== 🎯 QUERY-SPECIFIC INSTRUCTIONS ===\n';
    
    switch (queryAnalysis.type) {
      case 'monthly_data':
        if (queryAnalysis.specificMonth && queryAnalysis.specificYear) {
          const monthName = this.getMonthName(queryAnalysis.specificMonth);
          instructions += `🎯 USER ASKED ABOUT: ${monthName} ${queryAnalysis.specificYear} reviews\n`;
          instructions += `📊 ANSWER PROVIDED ABOVE: Check the "IMMEDIATE ANSWER" section\n`;
          instructions += `🚫 DO NOT say "data doesn't exist" - report the exact count shown above\n`;
          instructions += `✅ FORMAT: "Your database contains exactly [X] reviews for ${monthName} ${queryAnalysis.specificYear}"\n`;
        } else {
          instructions += `📅 MONTHLY DATA QUERY: Provide monthly breakdown as shown above\n`;
        }
        break;
      case 'recent_activity':
        instructions += `📅 RECENT ACTIVITY QUERY: Focus on last 30-90 days data shown above\n`;
        break;
      default:
        instructions += `📋 GENERAL QUERY: Use all available data to provide comprehensive answer\n`;
    }
    
    instructions += `\n🔍 Current Question: ${userMessage}\n`;
    instructions += `🎯 Confidence Level: ${queryAnalysis.confidence.toFixed(1)}\n`;
    
    instructions += `\n✅ CRITICAL: Answer based on the EXACT data provided above. Do not make assumptions.`;
    
    return instructions;
  }
  
  private getMonthName(monthNumber: string): string {
    const months = {
      '01': 'January', '02': 'February', '03': 'March', '04': 'April',
      '05': 'May', '06': 'June', '07': 'July', '08': 'August',
      '09': 'September', '10': 'October', '11': 'November', '12': 'December'
    };
    return months[monthNumber as keyof typeof months] || 'Unknown';
  }
}
