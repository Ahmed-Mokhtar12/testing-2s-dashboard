export class ContextDataStatsBuilder {
  static buildDataStatistics(data: any): string {
    const stats: string[] = [];
    stats.push('📊 YOUR CURRENT DATABASE ACCESS STATUS:');
    
    const sources = [
      { name: 'Hotel Reviews', data: data.hotelReviews, key: 'hotelReviews' },
      { name: 'Chat History', data: data.chatHistory, key: 'chatHistory' },
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

  static getDataSourcesList(data: any): string[] {
    const sources: string[] = [];
    
    if (data.hotelReviews?.status === 'fulfilled' && data.hotelReviews.value.data?.length > 0) {
      sources.push('Hotel Reviews');
    }
    if (data.chatHistory?.status === 'fulfilled' && data.chatHistory.value.data?.length > 0) {
      sources.push('Chat History');
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