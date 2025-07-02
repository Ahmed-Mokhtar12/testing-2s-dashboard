import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { DataStats } from './types.ts';
import { DataAnalysisUtils } from './data-analysis-utils.ts';
import { DataStatsLogger } from './data-stats-logger.ts';
import { QuerySpecificDataService, DataFetchPlan } from './query-specific-data-service.ts';
import { EnhancedErrorHandler } from './enhanced-error-handler.ts';
import { QueryAnalysis } from './query-analyzer.ts';

export class EnhancedDataService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  async fetchOptimizedDataWithContext(queryAnalysis: QueryAnalysis) {
    console.log('🎯 Fetching optimized data based on query analysis...');
    
    const fetchPlan = QuerySpecificDataService.createFetchPlan(queryAnalysis);
    const promises: Promise<any>[] = [];
    const promiseMap: Record<string, number> = {};
    let index = 0;

    // Only fetch required data sources based on query analysis
    if (fetchPlan.shouldFetchReviews) {
      promises.push(this.fetchHotelReviewsWithRetry());
      promiseMap['hotelReviews'] = index++;
    }
    if (fetchPlan.shouldFetchChat) {
      promises.push(this.fetchChatHistoryWithRetry());
      promiseMap['chatHistory'] = index++;
    }
    if (fetchPlan.shouldFetchEmails) {
      promises.push(this.fetchInfoSummaryWithRetry());
      promiseMap['infoSummary'] = index++;
    }
    if (fetchPlan.shouldFetchTraining) {
      promises.push(this.fetchConductedTrainingWithRetry());
      promiseMap['conductedTraining'] = index++;
    }
    if (fetchPlan.shouldFetchMemory) {
      promises.push(this.fetchLongTermMemoryWithRetry());
      promiseMap['longTermMemory'] = index++;
    }
    if (fetchPlan.shouldFetchVector) {
      promises.push(this.fetchVectorSearchWithRetry());
      promiseMap['vectorSearch'] = index++;
    }
    if (fetchPlan.shouldFetchDocuments) {
      promises.push(this.getRecentDocumentsWithRetry());
      promiseMap['recentDocuments'] = index++;
      promises.push(this.getRecentDocumentContextWithRetry());
      promiseMap['documentContext'] = index++;
    }

    const results = await Promise.allSettled(promises);
    
    // Map results back to named properties
    const data: any = {};
    Object.entries(promiseMap).forEach(([key, idx]) => {
      data[key] = results[idx];
    });

    console.log('✅ Optimized data fetch completed. Fetched sources:', Object.keys(data));
    return data;
  }

  // Legacy method for backward compatibility
  async fetchAllDataWithDocumentContext() {
    console.log('📊 Fetching comprehensive hotel data with document context (legacy)...');
    
    const [
      hotelReviews, 
      chatHistory, 
      infoSummary, 
      conductedTraining, 
      longTermMemory, 
      vectorSearch,
      recentDocuments,
      documentContext
    ] = await Promise.allSettled([
      this.fetchHotelReviewsWithRetry(),
      this.fetchChatHistoryWithRetry(),
      this.fetchInfoSummaryWithRetry(),
      this.fetchConductedTrainingWithRetry(),
      this.fetchLongTermMemoryWithRetry(),
      this.fetchVectorSearchWithRetry(),
      this.getRecentDocumentsWithRetry(),
      this.getRecentDocumentContextWithRetry()
    ]);

    DataStatsLogger.logEnhancedDataStats({
      hotelReviews,
      chatHistory,
      infoSummary,
      conductedTraining,
      longTermMemory,
      vectorSearch,
      recentDocuments,
      documentContext
    });

    return {
      hotelReviews,
      chatHistory,
      infoSummary,
      conductedTraining,
      longTermMemory,
      vectorSearch,
      recentDocuments,
      documentContext
    };
  }

  private async fetchHotelReviews() {
    try {
      console.log('🔍 Fetching Hotel Reviews...');
      
      // First, let's check total count
      const { count } = await this.supabase
        .from('Hotel Reviews')
        .select('*', { count: 'exact', head: true });
      
      console.log('📊 Total Hotel Reviews count:', count);
      
      // Fetch all reviews without any filtering
      const allReviews = await this.supabase
        .from('Hotel Reviews')
        .select('*')
        .order('created_at', { ascending: false });
      
      console.log('📋 All Hotel Reviews raw result:', allReviews);
      console.log('📋 Hotel Reviews data length:', allReviews.data?.length);
      
      if (allReviews.data && allReviews.data.length > 0) {
        console.log('📝 Sample review data:', JSON.stringify(allReviews.data[0], null, 2));
        
        this.analyzeReviewData(allReviews.data);
      }
      
      // Return all reviews without any filtering
      return allReviews;
      
    } catch (error) {
      console.error('❌ Error fetching Hotel Reviews:', error);
      return { status: 'rejected', reason: error.message };
    }
  }

  private analyzeReviewData(reviews: any[]) {
    // Analyze review data for debugging
    const reviewsWithSummary = reviews.filter(review => 
      review['Reviews Summary'] && review['Reviews Summary'].trim() !== ''
    );
    console.log('📊 Reviews with Summary count:', reviewsWithSummary.length);
    
    // Check which reviews have any content
    const reviewsWithContent = reviews.filter(review => 
      review['Reviews Summary'] || review['Text'] || review['Title']
    );
    console.log('📊 Reviews with any content count:', reviewsWithContent.length);
    
    // Check reviews by source
    const sourceBreakdown = reviews.reduce((acc: any, review: any) => {
      const source = review.Source || 'Unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 Reviews by source:', sourceBreakdown);
    
    // Analyze recent reviews
    const recentAnalysis = DataAnalysisUtils.analyzeRecentReviews(reviews);
    console.log('📊 Recent reviews analysis:', recentAnalysis);
    
    // Log specific dates for debugging
    const reviewDates = reviews
      .filter(review => review.Date)
      .map(review => review.Date)
      .sort()
      .slice(0, 10);
    console.log('📅 Sample review dates:', reviewDates);
    
    // Add comprehensive monthly analysis for better AI context
    const monthlyBreakdown = DataAnalysisUtils.analyzeReviewsByMonth(reviews);
    console.log('📊 Monthly review breakdown (Enhanced Data Service):', monthlyBreakdown);
    
    // Specifically check for June 2025 data
    const june2025Count = monthlyBreakdown['2025-06'] || 0;
    console.log('🎯 JUNE 2025 REVIEW COUNT FROM BREAKDOWN:', june2025Count);
    
    // Log some sample June 2025 dates for verification
    const june2025Reviews = reviews.filter(review => 
      review.Date && review.Date.toString().startsWith('2025-06')
    );
    console.log('🗓️ June 2025 reviews found in dataset:', june2025Reviews.length);
    if (june2025Reviews.length > 0) {
      console.log('📅 Sample June 2025 dates:', june2025Reviews.slice(0, 5).map(r => r.Date));
    }
  }

  // Enhanced methods with retry logic
  private async fetchHotelReviewsWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.fetchHotelReviews(),
      'fetch-hotel-reviews'
    );
  }

  private async fetchChatHistoryWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.fetchChatHistory(),
      'fetch-chat-history'
    );
  }

  private async fetchInfoSummaryWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.fetchInfoSummary(),
      'fetch-info-summary'
    );
  }

  private async fetchConductedTrainingWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.fetchConductedTraining(),
      'fetch-conducted-training'
    );
  }

  private async fetchLongTermMemoryWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.fetchLongTermMemory(),
      'fetch-long-term-memory'
    );
  }

  private async fetchVectorSearchWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.fetchVectorSearch(),
      'fetch-vector-search'
    );
  }

  private async getRecentDocumentsWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.getRecentDocuments(),
      'fetch-recent-documents'
    );
  }

  private async getRecentDocumentContextWithRetry() {
    return EnhancedErrorHandler.withRetry(
      () => this.getRecentDocumentContext(),
      'fetch-document-context'
    );
  }

  private async fetchChatHistory() {
    try {
      const result = await this.supabase
        .from('Chat History')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      
      console.log('💬 Chat History result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching Chat History:', error);
      throw error;
    }
  }

  private async fetchInfoSummary() {
    try {
      const result = await this.supabase
        .from('Info Summary')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      console.log('📧 Info Summary result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching Info Summary:', error);
      throw error;
    }
  }

  private async fetchConductedTraining() {
    try {
      const result = await this.supabase
        .from('Conducted Training')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      console.log('🎓 Conducted Training result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching Conducted Training:', error);
      throw error;
    }
  }

  private async fetchLongTermMemory() {
    try {
      const result = await this.supabase
        .from('LongTermMemory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);
      
      console.log('🧠 LongTermMemory result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching LongTermMemory:', error);
      throw error;
    }
  }

  private async fetchVectorSearch() {
    try {
      const result = await this.supabase
        .from('N8N_2S')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      console.log('🔍 N8N_2S result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching N8N_2S:', error);
      throw error;
    }
  }

  async getRecentDocuments() {
    try {
      const result = await this.supabase
        .from('uploaded_documents')
        .select('*')
        .eq('upload_status', 'processed')
        .gte('relevance_score', 0.3)
        .not('original_filename', 'is', null)
        .order('last_accessed', { ascending: false })
        .limit(5);
      
      console.log('📄 Recent documents query result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching recent documents:', error);
      throw error;
    }
  }

  async getRecentDocumentContext() {
    try {
      const result = await this.supabase.rpc('get_recent_document_context', { limit_count: 10 });
      console.log('🎯 Document context query result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching document context:', error);
      throw error;
    }
  }

  async updateDocumentAccess(documentId: string) {
    try {
      await this.supabase.rpc('mark_recent_document_context', { doc_id: documentId });
      console.log('✅ Updated document access for:', documentId);
    } catch (error) {
      console.error('❌ Error updating document access:', error);
    }
  }

  async saveConversation(userMessage: string, aiResponse: string) {
    try {
      console.log('💾 Saving conversation to long-term memory...');
      const memoryResult = await this.supabase.from('LongTermMemory').insert({
        sender: 'User/Guest',
        recipient: 'Two Seasons Hotel AI Consultant',
        message: `👤 User: ${userMessage}\n🤖 Consultant: ${aiResponse}`,
        created_at: new Date().toISOString()
      });

      if (memoryResult.error) {
        console.error('❌ Error saving conversation:', memoryResult.error);
      } else {
        console.log('✅ Successfully saved conversation to long-term memory');
      }
    } catch (memoryError) {
      console.error('❌ Failed to save conversation:', memoryError);
    }
  }

  createEnhancedDataStats(results: any): DataStats & { recentDocuments: number; documentContext: number } {
    return DataStatsLogger.createEnhancedDataStats(results);
  }
}