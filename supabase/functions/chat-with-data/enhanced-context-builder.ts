import { ReviewAnalysisUtils } from './review-analysis-utils.ts';
import { ContextDataStatsBuilder } from './context-data-stats-builder.ts';
import { ContextSectionBuilder } from './context-section-builder.ts';

export class EnhancedContextBuilder {
  buildContextWithDocuments(data: any, userMessage: string): string {
    const contextSections: string[] = [];

    // Add clear database access statement and role definition
    contextSections.push(ContextSectionBuilder.buildRoleAndAccessSection());

    // Add data statistics to show AI what's available
    const dataStats = ContextDataStatsBuilder.buildDataStatistics(data);
    contextSections.push(dataStats);

    // Add document context sections
    contextSections.push(...ContextSectionBuilder.buildDocumentContextSections(data));

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
      review['Reviews Summary'] || review['Text'] || review['Title']
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
      Object.entries(monthlyBreakdown).forEach(([monthKey, count]) => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
        contextSections.push(`   • ${monthName} ${year}: ${count} reviews`);
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

    return contextSections;
  }
}