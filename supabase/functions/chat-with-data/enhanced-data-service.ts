
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
      this.supabase.from('Hotel Reviews').select('*').order('created_at', { ascending: false }).limit(20),
      this.supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(30),
      this.supabase.from('Info Summary').select('*').order('created_at', { ascending: false }).limit(20),
      this.supabase.from('Conducted Training').select('*').order('created_at', { ascending: false }).limit(20),
      this.supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(25),
      this.supabase.from('N8N_2S').select('*').order('created_at', { ascending: false }).limit(10),
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
    return this.supabase
      .from('uploaded_documents')
      .select('*')
      .eq('upload_status', 'processed')
      .gte('relevance_score', 0.5)
      .order('last_accessed', { ascending: false })
      .limit(5);
  }

  async getRecentDocumentContext() {
    return this.supabase.rpc('get_recent_document_context', { limit_count: 10 });
  }

  async updateDocumentAccess(documentId: string) {
    await this.supabase.rpc('mark_recent_document_context', { doc_id: documentId });
  }

  private logEnhancedDataStats(results: any) {
    console.log('📈 Hotel Reviews:', results.hotelReviews.status === 'fulfilled' ? `${results.hotelReviews.value.data?.length || 0} records` : results.hotelReviews.reason);
    console.log('💬 Chat History:', results.chatHistory.status === 'fulfilled' ? `${results.chatHistory.value.data?.length || 0} records` : results.chatHistory.reason);
    console.log('📧 Info Summary:', results.infoSummary.status === 'fulfilled' ? `${results.infoSummary.value.data?.length || 0} records` : results.infoSummary.reason);
    console.log('🎓 Conducted Training:', results.conductedTraining.status === 'fulfilled' ? `${results.conductedTraining.value.data?.length || 0} records` : results.conductedTraining.reason);
    console.log('🧠 Long Term Memory:', results.longTermMemory.status === 'fulfilled' ? `${results.longTermMemory.value.data?.length || 0} records` : results.longTermMemory.reason);
    console.log('🔍 Vector Search:', results.vectorSearch.status === 'fulfilled' ? `${results.vectorSearch.value.data?.length || 0} records` : results.vectorSearch.reason);
    console.log('📄 Recent Documents:', results.recentDocuments.status === 'fulfilled' ? `${results.recentDocuments.value.data?.length || 0} documents` : results.recentDocuments.reason);
    console.log('🎯 Document Context:', results.documentContext.status === 'fulfilled' ? `${results.documentContext.value.data?.length || 0} chunks` : results.documentContext.reason);
  }

  async saveConversation(userMessage: string, aiResponse: string) {
    try {
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
    return {
      hotelReviews: results.hotelReviews.status === 'fulfilled' ? results.hotelReviews.value.data?.length || 0 : 0,
      chatHistory: results.chatHistory.status === 'fulfilled' ? results.chatHistory.value.data?.length || 0 : 0,
      infoSummary: results.infoSummary.status === 'fulfilled' ? results.infoSummary.value.data?.length || 0 : 0,
      conductedTraining: results.conductedTraining.status === 'fulfilled' ? results.conductedTraining.value.data?.length || 0 : 0,
      longTermMemory: results.longTermMemory.status === 'fulfilled' ? results.longTermMemory.value.data?.length || 0 : 0,
      vectorSearch: results.vectorSearch.status === 'fulfilled' ? results.vectorSearch.value.data?.length || 0 : 0,
      recentDocuments: results.recentDocuments.status === 'fulfilled' ? results.recentDocuments.value.data?.length || 0 : 0,
      documentContext: results.documentContext.status === 'fulfilled' ? results.documentContext.value.data?.length || 0 : 0
    };
  }
}
