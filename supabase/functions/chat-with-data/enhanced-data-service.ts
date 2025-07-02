
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
      this.supabase.from('Hotel Reviews')
        .select('*')
        .not('Reviews Summary', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      this.supabase.from('Chat History')
        .select('*')
        .not('Sender Message', 'is', null)
        .not('Ai Reply', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30),
      this.supabase.from('Info Summary')
        .select('*')
        .not('Email Summary', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      this.supabase.from('Conducted Training')
        .select('*')
        .not('Summary of the training', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      this.supabase.from('LongTermMemory')
        .select('*')
        .not('message', 'is', null)
        .order('created_at', { ascending: false })
        .limit(25),
      this.supabase.from('N8N_2S')
        .select('*')
        .not('content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10),
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
    
    // Log sample data to verify content
    if (results.hotelReviews.status === 'fulfilled' && results.hotelReviews.value.data?.length > 0) {
      console.log('📝 Sample review:', results.hotelReviews.value.data[0]['Reviews Summary']?.substring(0, 100));
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
}
