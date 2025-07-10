// Conversation Context Validator - Validates conversation continuity and context usage
export class ConversationContextValidator {

  static validateConversationContinuity(
    content: string,
    userMessage: string,
    conversationData: any
  ): {
    issues: string[];
    suggestions: string[];
    contextScore: number;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let contextScore = 1.0; // Start with perfect score

    // Check for conversation continuity
    if (conversationData.recentDataPoints?.size > 0) {
      const hasScoreReference = conversationData.recentDataPoints.has('recent_score');
      const hasTimeReference = conversationData.recentDataPoints.has('time_period');

      // If user asked about recently mentioned data
      if (userMessage.includes('that score') || userMessage.includes('this data')) {
        if (hasScoreReference && !content.includes(conversationData.recentDataPoints.get('recent_score'))) {
          issues.push('Response does not reference recently mentioned score');
          suggestions.push(`Reference the score: ${conversationData.recentDataPoints.get('recent_score')}`);
          contextScore -= 0.3;
        }
      }

      if (userMessage.includes('that month') || userMessage.includes('that period')) {
        if (hasTimeReference && !content.includes(conversationData.recentDataPoints.get('time_period'))) {
          issues.push('Response does not reference recently mentioned time period');
          suggestions.push(`Reference the period: ${conversationData.recentDataPoints.get('time_period')}`);
          contextScore -= 0.3;
        }
      }
    }

    // Check for unnecessary clarification requests
    const clarificationPhrases = [
      'which score',
      'what data',
      'which month',
      'could you specify',
      'need more information',
      'أي نقاط',
      'أي بيانات',
      'أي شهر'
    ];

    if (clarificationPhrases.some(phrase => content.toLowerCase().includes(phrase))) {
      if (conversationData.recentDataPoints?.size > 0) {
        issues.push('Asking for clarification despite having available conversation context');
        suggestions.push('Use available conversation memory instead of asking for clarification');
        contextScore -= 0.4;
      }
    }

    // Ensure score is within bounds
    contextScore = Math.max(0, Math.min(1, contextScore));

    return {
      issues,
      suggestions,
      contextScore
    };
  }

  static checkLanguageConsistency(content: string): {
    issues: string[];
    suggestions: string[];
    isConsistent: boolean;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for English responses when Arabic expected
    const hasEnglishErrors = content.includes('I apologize') || content.includes('I am unable');
    
    if (hasEnglishErrors) {
      issues.push('Response in English instead of Arabic');
      suggestions.push('Respond in Arabic for better user experience');
    }

    return {
      issues,
      suggestions,
      isConsistent: !hasEnglishErrors
    };
  }

  static validateToolUsage(userMessage: string, response: any): {
    issues: string[];
    suggestions: string[];
    shouldUseTools: boolean;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for website search requirement
    const hotelKeywords = ['room', 'amenity', 'service', 'pool', 'restaurant', 'booking', 'price'];
    const mentionsHotelServices = hotelKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );

    const shouldUseTools = mentionsHotelServices;

    if (mentionsHotelServices && !response.message?.tool_calls) {
      issues.push('Hotel service query without website search');
      suggestions.push('Should have triggered search_web function for current hotel information');
    }

    return {
      issues,
      suggestions,
      shouldUseTools
    };
  }
}