export interface SearchDecisionResult {
  requiresWebsiteSearch: boolean;
  requiresRateLookup: boolean;
  hasRichDatabaseContext: boolean;
  searchReason: string;
}

export class SearchDecisionEngine {
  static analyzeSearchRequirement(context: string, message: string): SearchDecisionResult {
    console.log('🔍 Analyzing search requirement...');
    
    const hasRichDatabaseContext = context.includes('HOTEL REVIEWS') || 
                                  context.includes('COMPREHENSIVE HOTEL ANALYTICS') ||
                                  context.includes('RECENTLY UPLOADED DOCUMENTS') ||
                                  context.includes('TOTAL REVIEWS IN DATABASE');
    
    // Check if this is a rate/price query
    const rateKeywords = [
      'rate', 'price', 'tariff', 'cost', 'pricing', 'how much',
      'سعر', 'أسعار', 'تكلفة', 'كم سعر', 'أسعار الغرف',
      'room rate', 'nightly rate', 'per night', 'accommodation cost',
      'ليلة', 'ليالي'
    ];
    const requiresRateLookup = rateKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // Real-time info keywords
    const realTimeKeywords = [
      'current', 'latest', 'today', 'now', 'availability', 
      'contact', 'location', 'booking', 'real-time',
      'الحالي', 'الآن', 'اليوم', 'متاح', 'التواصل', 'الموقع'
    ];
    
    const hasRealTimeRequest = realTimeKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const serviceKeywords = [
      'amenity', 'service', 'pool', 'restaurant', 
      'facility', 'hours', 'schedule', 'menu', 'spa',
      'خدمة', 'مسبح', 'مطعم', 'مرافق', 'ساعات', 'جدول'
    ];
    
    const hasServiceInquiry = serviceKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    let requiresWebsiteSearch = false;
    let searchReason = '';
    
    if (requiresRateLookup) {
      searchReason = 'Rate/price query detected — will use get_hotel_rates tool';
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
      requiresWebsiteSearch,
      requiresRateLookup,
      searchReason
    });
    
    return {
      requiresWebsiteSearch,
      requiresRateLookup,
      hasRichDatabaseContext,
      searchReason
    };
  }
  
  static determineToolChoice(searchDecision: SearchDecisionResult): any {
    if (searchDecision.requiresRateLookup) {
      return {
        type: 'function',
        function: { name: 'get_hotel_rates' }
      };
    }
    if (searchDecision.requiresWebsiteSearch) {
      return {
        type: 'function',
        function: { name: 'search_web' }
      };
    }
    return 'auto';
  }
}