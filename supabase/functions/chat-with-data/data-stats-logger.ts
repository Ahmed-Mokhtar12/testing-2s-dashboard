import { DataStats } from './types.ts';

export class DataStatsLogger {
  static logEnhancedDataStats(results: any) {
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

  static createEnhancedDataStats(results: any): DataStats & { recentDocuments: number; documentContext: number } {
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