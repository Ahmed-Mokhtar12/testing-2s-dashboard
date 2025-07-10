// Data Availability Checker - Phase 1 of AI Data Integrity Plan
export class DataAvailabilityChecker {
  
  // Define what data is actually available in the database
  static readonly AVAILABLE_DATA_TYPES = {
    REVIEWS: 'guest_reviews',
    CHAT_HISTORY: 'chat_history', 
    TRAINING: 'training_records',
    INFO_SUMMARY: 'email_summaries',
    LONG_TERM_MEMORY: 'conversation_memory',
    DOCUMENTS: 'uploaded_documents',
    SOP: 'standard_procedures'
  } as const;

  // Define what operational data is NOT available
  static readonly UNAVAILABLE_DATA_TYPES = {
    OCCUPANCY: 'occupancy_rates',
    REVENUE: 'revenue_data',
    ADR: 'average_daily_rate',
    REVPAR: 'revenue_per_available_room',
    ROOM_INVENTORY: 'room_inventory',
    BOOKING_DATA: 'booking_statistics',
    OPERATIONAL_METRICS: 'operational_metrics',
    FINANCIAL_DATA: 'financial_data',
    REAL_TIME_AVAILABILITY: 'real_time_availability'
  } as const;

  static assessDataAvailability(userQuery: string, availableData: any): {
    canAnswerCompletely: boolean;
    availableDataSources: string[];
    missingDataSources: string[];
    dataGaps: string[];
    recommendedDataRequest: string | null;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  } {
    const queryLower = userQuery.toLowerCase();
    const availableDataSources: string[] = [];
    const missingDataSources: string[] = [];
    const dataGaps: string[] = [];
    
    // Check available data sources
    this.checkAvailableData(availableData, availableDataSources);
    
    // Identify missing operational data based on user query
    const missingOperationalData = this.identifyMissingOperationalData(queryLower);
    missingDataSources.push(...missingOperationalData);
    
    // Determine if query can be answered completely
    const canAnswerCompletely = this.determineAnswerCompleteness(queryLower, availableDataSources, missingDataSources);
    
    // Generate data request recommendation
    const recommendedDataRequest = this.generateDataRequest(queryLower, missingDataSources);
    
    // Calculate confidence level
    const confidenceLevel = this.calculateConfidenceLevel(canAnswerCompletely, availableDataSources.length, missingDataSources.length);
    
    // Identify specific data gaps
    this.identifyDataGaps(queryLower, dataGaps);

    return {
      canAnswerCompletely,
      availableDataSources,
      missingDataSources,
      dataGaps,
      recommendedDataRequest,
      confidenceLevel
    };
  }

  private static checkAvailableData(availableData: any, availableDataSources: string[]): void {
    if (availableData?.hotelReviews?.status === 'fulfilled' && availableData.hotelReviews.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.REVIEWS);
    }
    
    if (availableData?.chatHistory?.status === 'fulfilled' && availableData.chatHistory.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.CHAT_HISTORY);
    }
    
    if (availableData?.conductedTraining?.status === 'fulfilled' && availableData.conductedTraining.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.TRAINING);
    }
    
    if (availableData?.documentContext?.status === 'fulfilled' && availableData.documentContext.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.DOCUMENTS);
    }
    
    if (availableData?.infoSummary?.status === 'fulfilled' && availableData.infoSummary.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.INFO_SUMMARY);
    }
    
    if (availableData?.longTermMemory?.status === 'fulfilled' && availableData.longTermMemory.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.LONG_TERM_MEMORY);
    }
  }

  private static identifyMissingOperationalData(queryLower: string): string[] {
    const missing: string[] = [];

    // Check for occupancy-related queries
    if (queryLower.includes('occupancy') || queryLower.includes('occupied') || queryLower.includes('vacancy')) {
      missing.push(this.UNAVAILABLE_DATA_TYPES.OCCUPANCY);
    }

    // Check for revenue-related queries
    if (queryLower.includes('revenue') || queryLower.includes('income') || queryLower.includes('earnings') || queryLower.includes('adr') || queryLower.includes('average daily rate')) {
      missing.push(this.UNAVAILABLE_DATA_TYPES.REVENUE, this.UNAVAILABLE_DATA_TYPES.ADR);
    }

    // Check for booking-related queries  
    if (queryLower.includes('booking') || queryLower.includes('reservation') || queryLower.includes('availability')) {
      missing.push(this.UNAVAILABLE_DATA_TYPES.BOOKING_DATA, this.UNAVAILABLE_DATA_TYPES.REAL_TIME_AVAILABILITY);
    }

    // Check for room inventory queries
    if (queryLower.includes('room count') || queryLower.includes('inventory') || queryLower.includes('room types')) {
      missing.push(this.UNAVAILABLE_DATA_TYPES.ROOM_INVENTORY);
    }

    // Check for financial metrics
    if (queryLower.includes('profit') || queryLower.includes('costs') || queryLower.includes('expenses') || queryLower.includes('revpar')) {
      missing.push(this.UNAVAILABLE_DATA_TYPES.FINANCIAL_DATA, this.UNAVAILABLE_DATA_TYPES.REVPAR);
    }

    return [...new Set(missing)]; // Remove duplicates
  }

  private static determineAnswerCompleteness(queryLower: string, available: string[], missing: string[]): boolean {
    // If query asks for operational data and we don't have it, we can't answer completely
    if (missing.length > 0) {
      return false;
    }

    // If query is about reviews/feedback and we have review data, we can answer
    if ((queryLower.includes('review') || queryLower.includes('feedback') || queryLower.includes('guest') || queryLower.includes('rating')) 
        && available.includes(this.AVAILABLE_DATA_TYPES.REVIEWS)) {
      return true;
    }

    // If query is general and we have some data, we can provide partial answer
    if (available.length > 0 && missing.length === 0) {
      return true;
    }

    return false;
  }

  private static generateDataRequest(queryLower: string, missingDataSources: string[]): string | null {
    if (missingDataSources.length === 0) {
      return null;
    }

    const dataRequests: string[] = [];

    if (missingDataSources.includes(this.UNAVAILABLE_DATA_TYPES.OCCUPANCY)) {
      dataRequests.push('🏨 معدلات الإشغال اليومية/الشهرية');
    }

    if (missingDataSources.includes(this.UNAVAILABLE_DATA_TYPES.REVENUE)) {
      dataRequests.push('💰 بيانات الإيرادات (يومية/شهرية)');
    }

    if (missingDataSources.includes(this.UNAVAILABLE_DATA_TYPES.ADR)) {
      dataRequests.push('📊 متوسط السعر اليومي (ADR)');
    }

    if (missingDataSources.includes(this.UNAVAILABLE_DATA_TYPES.BOOKING_DATA)) {
      dataRequests.push('📅 بيانات الحجوزات والتوفر');
    }

    if (missingDataSources.includes(this.UNAVAILABLE_DATA_TYPES.ROOM_INVENTORY)) {
      dataRequests.push('🛏️ جرد الغرف وأنواعها');
    }

    if (missingDataSources.includes(this.UNAVAILABLE_DATA_TYPES.FINANCIAL_DATA)) {
      dataRequests.push('💳 البيانات المالية والتكاليف');
    }

    if (dataRequests.length > 0) {
      return `لتقديم تحليل دقيق، أحتاج إلى البيانات التالية:\n\n${dataRequests.join('\n')}\n\nيمكنك تزويدي بهذه البيانات أو رفع المستندات التي تحتويها.`;
    }

    return null;
  }

  private static calculateConfidenceLevel(canAnswer: boolean, availableCount: number, missingCount: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (canAnswer && missingCount === 0) {
      return 'HIGH';
    }
    
    if (availableCount > 0 && missingCount <= 2) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  private static identifyDataGaps(queryLower: string, dataGaps: string[]): void {
    // Common data gaps for hotel management
    if (queryLower.includes('performance') || queryLower.includes('kpi')) {
      dataGaps.push('لا توجد مؤشرات أداء رئيسية متاحة');
    }

    if (queryLower.includes('competitor') || queryLower.includes('market')) {
      dataGaps.push('لا توجد بيانات المنافسين أو السوق');
    }

    if (queryLower.includes('forecast') || queryLower.includes('prediction')) {
      dataGaps.push('لا توجد بيانات تاريخية للتنبؤ');
    }
  }

  static getAvailableDataSummary(availableData: any): string {
    const summary: string[] = [];
    
    if (availableData?.hotelReviews?.value?.data?.length > 0) {
      const count = availableData.hotelReviews.value.data.length;
      summary.push(`📝 ${count} مراجعة ضيوف`);
    }
    
    if (availableData?.documentContext?.value?.data?.length > 0) {
      const count = availableData.documentContext.value.data.length;
      summary.push(`📄 ${count} مستند`);
    }
    
    if (availableData?.chatHistory?.value?.data?.length > 0) {
      const count = availableData.chatHistory.value.data.length;
      summary.push(`💬 ${count} سجل محادثة`);
    }

    return summary.length > 0 
      ? `البيانات المتاحة: ${summary.join(', ')}`
      : 'لا توجد بيانات متاحة في قاعدة البيانات';
  }
}