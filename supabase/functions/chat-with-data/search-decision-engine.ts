export interface SearchDecisionResult {
  requiresWebsiteSearch: boolean;
  hasRichDatabaseContext: boolean;
  searchReason: string;
  isTrainingQuery: boolean;
}

export class SearchDecisionEngine {
  static analyzeSearchRequirement(context: string, message: string): SearchDecisionResult {
    console.log('🔍 Analyzing search requirement...');
    
    // Check if we have rich database context available
    const hasRichDatabaseContext = context.includes('HOTEL REVIEWS') || 
                                  context.includes('COMPREHENSIVE HOTEL ANALYTICS') ||
                                  context.includes('RECENTLY UPLOADED DOCUMENTS') ||
                                  context.includes('TOTAL REVIEWS IN DATABASE');
    
    // Keywords that suggest need for current/real-time information
    const realTimeKeywords = [
      'current', 'latest', 'today', 'now', 'availability', 
      'contact', 'location', 'price', 'booking', 'real-time',
      'الحالي', 'الآن', 'اليوم', 'متاح', 'التواصل', 'الموقع', 'السعر'
    ];
    
    const hasRealTimeRequest = realTimeKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // Hotel service keywords that might need current info
    const serviceKeywords = [
      'room', 'amenity', 'service', 'pool', 'restaurant', 
      'facility', 'hours', 'schedule', 'menu', 'spa',
      'غرفة', 'خدمة', 'مسبح', 'مطعم', 'مرافق', 'ساعات', 'جدول'
    ];
    
    const hasServiceInquiry = serviceKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    // Training questions must stay eligible for the query_training_records tool —
    // never force search_web for them.
    const trainingKeywords = [
      'training', 'trainer', 'trainers', 'trainee', 'attended', 'attendance',
      'تدريب', 'مدرب', 'مدربين', 'تدريبية', 'حضور'
    ];
    const isTrainingQuery = trainingKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    // Decision logic
    let requiresWebsiteSearch = false;
    let searchReason = '';
    
    if (isTrainingQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'Training question — leave tool choice to the model';
    } else if (!hasRichDatabaseContext && hasRealTimeRequest) {
      requiresWebsiteSearch = true;
      searchReason = 'No database context available and user requests current information';
    } else if (!hasRichDatabaseContext && hasServiceInquiry) {
      requiresWebsiteSearch = true;
      searchReason = 'Hotel service inquiry without database context';
    } else if (hasRealTimeRequest && hasServiceInquiry) {
      requiresWebsiteSearch = true;
      searchReason = 'Current service information requested';
    }
    
    console.log('📊 Search decision:', {
      hasRichDatabaseContext,
      hasRealTimeRequest,
      hasServiceInquiry,
      isTrainingQuery,
      requiresWebsiteSearch,
      searchReason
    });

    return {
      requiresWebsiteSearch,
      hasRichDatabaseContext,
      searchReason,
      isTrainingQuery
    };
  }
  
  static determineToolChoice(searchDecision: SearchDecisionResult): any {
    if (searchDecision.requiresWebsiteSearch) {
      return {
        type: 'function',
        function: { name: 'search_web' }
      };
    }
    return 'auto';
  }
}