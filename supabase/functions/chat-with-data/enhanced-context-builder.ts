import { ReviewAnalysisUtils } from './review-analysis-utils.ts';
import { ContextDataStatsBuilder } from './context-data-stats-builder.ts';
import { ContextSectionBuilder } from './context-section-builder.ts';
import { ScoreNormalizationUtils } from './score-normalization-utils.ts';
import { getDubaiTimezoneContext, DEFAULT_LANGUAGE } from './timezone-utils.ts';

export class EnhancedContextBuilder {
  buildContextWithDocuments(data: any, userMessage: string): string {
    const contextSections: string[] = [];

    // Add clear database access statement and role definition
    contextSections.push(ContextSectionBuilder.buildRoleAndAccessSection());
    
    // Add Dubai timezone and language context
    contextSections.push('⏰ OPERATIONAL CONTEXT:');
    contextSections.push(getDubaiTimezoneContext());
    contextSections.push(`Default Language: ${DEFAULT_LANGUAGE}`);
    contextSections.push('Hotel operates in Dubai timezone (GST, UTC+4) for all business operations.');
    contextSections.push('');

    // Add data statistics to show AI what's available
    const dataStats = ContextDataStatsBuilder.buildDataStatistics(data);
    contextSections.push(dataStats);

    // Add document context sections - PRIORITIZE recent uploaded documents
    const documentSections = ContextSectionBuilder.buildDocumentContextSections(data);
    if (documentSections.length > 0) {
      contextSections.push('🔥 RECENTLY UPLOADED DOCUMENTS (PRIORITY CONTEXT):');
      contextSections.push(...documentSections);
      contextSections.push('');
    }

    // Priority 3: Hotel Reviews - COMPREHENSIVE ANALYSIS
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      contextSections.push(...this.buildHotelReviewsSection(data.hotelReviews.value.data));
    }

    // Add other data sections
    contextSections.push(...ContextSectionBuilder.buildOtherDataSections(data));

    // Add clear instructions for using the database data
    contextSections.push(ContextSectionBuilder.buildInstructionsSection(userMessage));

    const context = contextSections.join('\n');
    
    console.log('🏗️ Built enhanced context with database access clarity, length:', context.length);
    console.log('📊 Context includes data from:', ContextDataStatsBuilder.getDataSourcesList(data));
    
    return context;
  }

  private buildHotelReviewsSection(allReviews: any[]): string[] {
    const contextSections: string[] = [];
    
    contextSections.push('⭐ COMPLETE HOTEL REVIEWS DATABASE:');
    contextSections.push(`📊 TOTAL REVIEWS IN DATABASE: ${allReviews.length}`);
    
    // Analyze all reviews comprehensively
    const reviewsWithContent = allReviews.filter((review: any) => 
      review['Text'] || review['Title']
    );
    
    const reviewsWithScores = allReviews.filter((review: any) => review.Score);
    const reviewsBySource = ReviewAnalysisUtils.analyzeReviewsBySource(allReviews);
    const reviewsByDate = ReviewAnalysisUtils.analyzeReviewsByDate(allReviews);
    const monthlyBreakdown = ReviewAnalysisUtils.analyzeReviewsByMonth(allReviews);
    
    contextSections.push(`📊 REVIEWS WITH CONTENT: ${reviewsWithContent.length}`);
    contextSections.push(`📊 REVIEWS WITH SCORES: ${reviewsWithScores.length}`);
    
    // Add source breakdown
    if (Object.keys(reviewsBySource).length > 0) {
      contextSections.push('📍 REVIEWS BY SOURCE:');
      Object.entries(reviewsBySource).forEach(([source, count]) => {
        contextSections.push(`   • ${source}: ${count} reviews`);
      });
    }
    
    // Add comprehensive monthly breakdown
    if (Object.keys(monthlyBreakdown).length > 0) {
      contextSections.push('📅 REVIEWS BY MONTH (EXACT BREAKDOWN):');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      console.log('🗓️ Context Builder - Monthly breakdown being added to context:', monthlyBreakdown);
      
      Object.entries(monthlyBreakdown).forEach(([monthKey, count]) => {
        const [year, month] = monthKey.split('-');
        const monthIndex = parseInt(month) - 1; // Convert to 0-based index
        const monthName = monthNames[monthIndex] || `Month-${month}`;
        const reviewText = `   • ${monthName} ${year}: ${count} reviews`;
        contextSections.push(reviewText);
        console.log(`📊 Context Builder - Added month entry: ${reviewText}`);
      });
    }
    
    // Add date analysis
    if (reviewsByDate.recentReviews > 0) {
      contextSections.push('📅 REVIEW TIMELINE ANALYSIS:');
      contextSections.push(`   • Reviews in last 30 days: ${reviewsByDate.recentReviews}`);
      contextSections.push(`   • Reviews in last 90 days: ${reviewsByDate.last90Days}`);
      contextSections.push(`   • Total historical reviews: ${allReviews.length}`);
    }
    
    // Enhanced scoring analysis with normalization
    if (reviewsWithScores.length > 0) {
      const scoringContext = ScoreNormalizationUtils.generateScoringContext(allReviews);
      contextSections.push(scoringContext);
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
        
        if (review['Text']) {
          contextSections.push(`   📄 Review: ${review['Text'].substring(0, 200)}${review['Text'].length > 200 ? '...' : ''}`);
        }
        
        if (review.Author) {
          contextSections.push(`   👤 Author: ${review.Author}`);
        }
        
        if (review.Date) {
          contextSections.push(`   📅 Date: ${review.Date}`);
        }
        
        if (review['Hotel Name']) {
          contextSections.push(`   🏨 Hotel: ${review['Hotel Name']}`);
        }
        
        contextSections.push('');
      });
    }
    contextSections.push('');

    return contextSections;
  }
}