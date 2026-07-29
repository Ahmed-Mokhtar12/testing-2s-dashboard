export interface SearchDecisionResult {
  requiresWebsiteSearch: boolean;
  hasRichDatabaseContext: boolean;
  searchReason: string;
  isTrainingQuery: boolean;
  isWhatsAppQuery: boolean;
  isReviewsQuery: boolean;
  isEmailsQuery: boolean;
  isRatesQuery: boolean;
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

    // WhatsApp/chat questions must stay eligible for the query_whatsapp_chats
    // tool — never force search_web for them. Training takes precedence when
    // both match (e.g. "attendance" alone shouldn't be overridden).
    const whatsappKeywords = ['whatsapp', 'chat history', 'guest chat', 'guest message', 'conversations', 'واتساب', 'محادثات'];
    const isWhatsAppQuery = !isTrainingQuery && whatsappKeywords.some(k => message.toLowerCase().includes(k));

    // Review questions must stay eligible for the query_reviews tool — never
    // force search_web for them. Training and WhatsApp take precedence when
    // both match.
    const reviewsKeywords = ['review', 'reviews', 'rating', 'ratings', 'guest feedback', 'تقييم', 'تقييمات', 'مراجعات'];
    const isReviewsQuery = !isTrainingQuery && !isWhatsAppQuery && reviewsKeywords.some(k => message.toLowerCase().includes(k));

    // Guest email questions must stay eligible for the query_sera_emails tool
    // — never force search_web for them. Training, WhatsApp, and reviews take
    // precedence when both match. "info email" is excluded: those questions
    // are answered from snapshot context, not this tool.
    const lower = message.toLowerCase();
    const emailsKeywords = ['email', 'emails', 'inbox', 'بريد', 'ايميل', 'إيميل'];
    const isEmailsQuery = !isTrainingQuery && !isWhatsAppQuery && !isReviewsQuery &&
      !lower.includes('info email') && emailsKeywords.some(k => lower.includes(k));

    // Competitor room-rate questions must stay eligible for the
    // query_competitor_rates tool — never force search_web for them.
    // Training, WhatsApp, reviews, and emails take precedence when both
    // match (reviews questions in particular must win ties, since "rating"
    // is a common way to ask about reviews). The bare 'rates' keyword uses a
    // word-boundary regex so "ratings" can never trigger this branch.
    const ratesKeywords = ['competitor', 'competitors', 'room rate', 'room rates', 'price comparison', 'pricing', 'rates', 'منافس', 'أسعار الغرف'];
    const isRatesQuery = !isTrainingQuery && !isWhatsAppQuery && !isReviewsQuery && !isEmailsQuery &&
      ratesKeywords.some(k => k === 'rates' ? /\brates?\b/.test(lower) : lower.includes(k));

    // Decision logic
    let requiresWebsiteSearch = false;
    let searchReason = '';

    if (isTrainingQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'Training question — leave tool choice to the model';
    } else if (isWhatsAppQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'WhatsApp/chat question — leave tool choice to the model';
    } else if (isReviewsQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'Reviews question — leave tool choice to the model';
    } else if (isEmailsQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'Guest email question — leave tool choice to the model';
    } else if (isRatesQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'Competitor rate question — leave tool choice to the model';
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
      isWhatsAppQuery,
      isReviewsQuery,
      isEmailsQuery,
      isRatesQuery,
      requiresWebsiteSearch,
      searchReason
    });

    return {
      requiresWebsiteSearch,
      hasRichDatabaseContext,
      searchReason,
      isTrainingQuery,
      isWhatsAppQuery,
      isReviewsQuery,
      isEmailsQuery,
      isRatesQuery
    };
  }

  static determineToolChoice(searchDecision: SearchDecisionResult): any {
    if (searchDecision.isTrainingQuery) {
      // 'auto' proved unreliable for training questions (the model sometimes
      // asks for confirmation or claims the tool is unavailable) — force it,
      // same pattern as the forced search_web call below.
      return {
        type: 'function',
        function: { name: 'query_training_records' }
      };
    }
    if (searchDecision.isWhatsAppQuery) {
      return {
        type: 'function',
        function: { name: 'query_whatsapp_chats' }
      };
    }
    if (searchDecision.isReviewsQuery) {
      return {
        type: 'function',
        function: { name: 'query_reviews' }
      };
    }
    if (searchDecision.isEmailsQuery) {
      return {
        type: 'function',
        function: { name: 'query_sera_emails' }
      };
    }
    if (searchDecision.isRatesQuery) {
      return {
        type: 'function',
        function: { name: 'query_competitor_rates' }
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