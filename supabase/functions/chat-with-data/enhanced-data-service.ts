
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { DataStats } from './types.ts';

export class EnhancedDataService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  async fetchAllDataWithDocumentContext() {
    console.log('📊 Fetching comprehensive hotel data with document context...');
    
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
      this.fetchHotelReviews(),
      this.fetchChatHistory(),
      this.fetchInfoSummary(),
      this.fetchConductedTraining(),
      this.fetchLongTermMemory(),
      this.fetchVectorSearch(),
      this.getRecentDocuments(),
      this.getRecentDocumentContext()
    ]);

    this.logEnhancedDataStats({
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
        
        // Analyze review data for debugging
        const reviewsWithSummary = allReviews.data.filter(review => 
          review['Reviews Summary'] && review['Reviews Summary'].trim() !== ''
        );
        console.log('📊 Reviews with Summary count:', reviewsWithSummary.length);
        
        // Check which reviews have any content
        const reviewsWithContent = allReviews.data.filter(review => 
          review['Reviews Summary'] || review['Text'] || review['Title']
        );
        console.log('📊 Reviews with any content count:', reviewsWithContent.length);
        
        // Check reviews by source
        const sourceBreakdown = allReviews.data.reduce((acc: any, review: any) => {
          const source = review.Source || 'Unknown';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {});
        console.log('📊 Reviews by source:', sourceBreakdown);
        
        // Check date distribution with current context
        const now = new Date('2025-01-02T00:00:00Z'); // Current date context
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        console.log('🗓️ Current date context:', now.toISOString());
        console.log('🗓️ Filtering for reviews after:', thirtyDaysAgo.toISOString());
        
        const recentReviews = allReviews.data.filter(review => {
          if (!review.Date) return false;
          const reviewDate = new Date(review.Date);
          const isRecent = reviewDate >= thirtyDaysAgo;
          if (isRecent) {
            console.log('✅ Found recent review:', review.Date, 'parsed as:', reviewDate.toISOString());
          }
          return isRecent;
        });
        console.log('📊 Reviews in last 30 days:', recentReviews.length);
        
        // Log specific dates for debugging
        const reviewDates = allReviews.data
          .filter(review => review.Date)
          .map(review => review.Date)
          .sort()
          .slice(0, 10);
        console.log('📅 Sample review dates:', reviewDates);
        
        // Add comprehensive monthly analysis for better AI context
        const monthlyBreakdown = this.analyzeReviewsByMonth(allReviews.data);
        console.log('📊 Monthly review breakdown:', monthlyBreakdown);
      }
      
      // Return all reviews without any filtering
      return allReviews;
      
    } catch (error) {
      console.error('❌ Error fetching Hotel Reviews:', error);
      return { status: 'rejected', reason: error.message };
    }
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
      return { status: 'rejected', reason: error.message };
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
      return { status: 'rejected', reason: error.message };
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
      return { status: 'rejected', reason: error.message };
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
      return { status: 'rejected', reason: error.message };
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
      return { status: 'rejected', reason: error.message };
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
      return { status: 'rejected', reason: error.message };
    }
  }

  async getRecentDocumentContext() {
    try {
      const result = await this.supabase.rpc('get_recent_document_context', { limit_count: 10 });
      console.log('🎯 Document context query result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error fetching document context:', error);
      return { status: 'rejected', reason: error.message };
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

  private logEnhancedDataStats(results: any) {
    console.log('=== 📊 ENHANCED DATA STATISTICS ===');
    console.log('📈 Hotel Reviews:', results.hotelReviews.status === 'fulfilled' ? `${results.hotelReviews.value.data?.length || 0} records` : `ERROR: ${results.hotelReviews.reason}`);
    console.log('💬 Chat History:', results.chatHistory.status === 'fulfilled' ? `${results.chatHistory.value.data?.length || 0} records` : `ERROR: ${results.chatHistory.reason}`);
    console.log('📧 Info Summary:', results.infoSummary.status === 'fulfilled' ? `${results.infoSummary.value.data?.length || 0} records` : `ERROR: ${results.infoSummary.reason}`);
    console.log('🎓 Conducted Training:', results.conductedTraining.status === 'fulfilled' ? `${results.conductedTraining.value.data?.length || 0} records` : `ERROR: ${results.conductedTraining.reason}`);
    console.log('🧠 Long Term Memory:', results.longTermMemory.status === 'fulfilled' ? `${results.longTermMemory.value.data?.length || 0} records` : `ERROR: ${results.longTermMemory.reason}`);
    console.log('🔍 Vector Search:', results.vectorSearch.status === 'fulfilled' ? `${results.vectorSearch.value.data?.length || 0} records` : `ERROR: ${results.vectorSearch.reason}`);
    console.log('📄 Recent Documents:', results.recentDocuments.status === 'fulfilled' ? `${results.recentDocuments.value.data?.length || 0} documents` : `ERROR: ${results.recentDocuments.reason}`);
    console.log('🎯 Document Context:', results.documentContext.status === 'fulfilled' ? `${results.documentContext.value.data?.length || 0} chunks` : `ERROR: ${results.documentContext.reason}`);
    
    // Log detailed sample data for debugging
    if (results.hotelReviews.status === 'fulfilled' && results.hotelReviews.value.data?.length > 0) {
      const sampleReview = results.hotelReviews.value.data[0];
      console.log('📝 Sample review keys:', Object.keys(sampleReview));
      console.log('📝 Sample review summary:', sampleReview['Reviews Summary']?.substring(0, 100));
      console.log('📝 Sample review text:', sampleReview['Text']?.substring(0, 100));
      console.log('📝 Sample review title:', sampleReview['Title']);
    }
    console.log('=== END DATA STATISTICS ===');
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
    const stats = {
      hotelReviews: results.hotelReviews.status === 'fulfilled' ? results.hotelReviews.value.data?.length || 0 : 0,
      chatHistory: results.chatHistory.status === 'fulfilled' ? results.chatHistory.value.data?.length || 0 : 0,
      infoSummary: results.infoSummary.status === 'fulfilled' ? results.infoSummary.value.data?.length || 0 : 0,
      conductedTraining: results.conductedTraining.status === 'fulfilled' ? results.conductedTraining.value.data?.length || 0 : 0,
      longTermMemory: results.longTermMemory.status === 'fulfilled' ? results.longTermMemory.value.data?.length || 0 : 0,
      vectorSearch: results.vectorSearch.status === 'fulfilled' ? results.vectorSearch.value.data?.length || 0 : 0,
      recentDocuments: results.recentDocuments.status === 'fulfilled' ? results.recentDocuments.value.data?.length || 0 : 0,
      documentContext: results.documentContext.status === 'fulfilled' ? results.documentContext.value.data?.length || 0 : 0
    };

    console.log('📊 Created enhanced data stats:', stats);
    return stats;
  }

  private analyzeReviewsByMonth(reviews: any[]): Record<string, number> {
    console.log('📅 Analyzing reviews by month...');
    const monthlyBreakdown: Record<string, number> = {};
    
    reviews.forEach(review => {
      if (review.Date && typeof review.Date === 'string') {
        try {
          // Use string manipulation to avoid timezone issues
          // Date format is expected to be "YYYY-MM-DD"
          const dateParts = review.Date.split('-');
          if (dateParts.length >= 2) {
            const year = dateParts[0];
            const month = dateParts[1];
            const monthKey = `${year}-${month}`;
            monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
            console.log(`✅ Processed review date ${review.Date} -> ${monthKey}`);
          } else {
            console.log(`⚠️ Unexpected date format: ${review.Date}`);
          }
        } catch (error) {
          console.error('❌ Error parsing date:', review.Date, error);
        }
      }
    });
    
    // Sort by month for better readability
    const sortedBreakdown: Record<string, number> = {};
    Object.keys(monthlyBreakdown)
      .sort()
      .forEach(key => {
        sortedBreakdown[key] = monthlyBreakdown[key];
      });
    
    console.log('📊 Monthly breakdown result:', sortedBreakdown);
    return sortedBreakdown;
  }
}
