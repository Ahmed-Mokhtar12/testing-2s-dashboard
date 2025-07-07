export class SmartResponseValidator {
  static validateAIResponse(response: any, userMessage: string, conversationData: any): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    if (!response) {
      issues.push('No response generated');
      return { isValid: false, issues, suggestions };
    }
    
    const content = response.message?.content || '';
    
    // Check for conversation continuity
    if (conversationData.recentDataPoints?.size > 0) {
      const hasScoreReference = conversationData.recentDataPoints.has('recent_score');
      const hasTimeReference = conversationData.recentDataPoints.has('time_period');
      
      // If user asked about recently mentioned data
      if (userMessage.includes('that score') || userMessage.includes('this data')) {
        if (hasScoreReference && !content.includes(conversationData.recentDataPoints.get('recent_score'))) {
          issues.push('Response does not reference recently mentioned score');
          suggestions.push(`Reference the score: ${conversationData.recentDataPoints.get('recent_score')}`);
        }
      }
      
      if (userMessage.includes('that month') || userMessage.includes('that period')) {
        if (hasTimeReference && !content.includes(conversationData.recentDataPoints.get('time_period'))) {
          issues.push('Response does not reference recently mentioned time period');
          suggestions.push(`Reference the period: ${conversationData.recentDataPoints.get('time_period')}`);
        }
      }
    }
    
    // Check for website search requirement
    const hotelKeywords = ['room', 'amenity', 'service', 'pool', 'restaurant', 'booking', 'price'];
    const mentionsHotelServices = hotelKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );
    
    if (mentionsHotelServices && !response.message?.tool_calls) {
      issues.push('Hotel service query without website search');
      suggestions.push('Should have triggered search_web function for current hotel information');
    }
    
    // Check response length and helpfulness
    if (content.length < 50) {
      issues.push('Response too short - may not be helpful');
      suggestions.push('Provide more detailed, actionable information');
    }
    
    if (content.length > 1000) {
      issues.push('Response too long - may overwhelm user');
      suggestions.push('Condense to key insights and actionable recommendations');
    }
    
    // Check for Arabic language compliance
    if (content.includes('I apologize') || content.includes('I am unable')) {
      issues.push('Response in English instead of Arabic');
      suggestions.push('Respond in Arabic for better user experience');
    }
    
    // Check for asking for clarification on recently discussed topics
    const clarificationPhrases = [
      'which score',
      'what data',
      'which month',
      'could you specify',
      'need more information'
    ];
    
    if (clarificationPhrases.some(phrase => content.toLowerCase().includes(phrase))) {
      if (conversationData.recentDataPoints?.size > 0) {
        issues.push('Asking for clarification on recently discussed data');
        suggestions.push('Use conversation memory to reference recent context');
      }
    }
    
    // Check for consultant personality
    const consultantKeywords = ['recommend', 'suggest', 'analyze', 'insight', 'strategy'];
    if (!consultantKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
      suggestions.push('Add consultative insights and recommendations');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      suggestions
    };
  }
  
  static enhanceResponseIfNeeded(
    response: any, 
    userMessage: string, 
    conversationData: any,
    validationResult: any
  ): any {
    if (validationResult.isValid) {
      return response;
    }
    
    console.log('🔧 Enhancing response based on validation issues:', validationResult.issues);
    
    let enhancedContent = response.message?.content || '';
    
    // Add conversation context if missing
    if (validationResult.issues.includes('Response does not reference recently mentioned score')) {
      const score = conversationData.recentDataPoints.get('recent_score');
      enhancedContent = `بناءً على النتيجة ${score} التي ناقشناها، ${enhancedContent}`;
    }
    
    if (validationResult.issues.includes('Response does not reference recently mentioned time period')) {
      const period = conversationData.recentDataPoints.get('time_period');
      enhancedContent = `في ${period} الذي تحدثنا عنه، ${enhancedContent}`;
    }
    
    // Add consultant recommendations if missing
    if (validationResult.suggestions.includes('Add consultative insights and recommendations')) {
      enhancedContent += '\n\n💡 توصيتي: قم بمراجعة هذه النقاط مع فريق الإدارة لتحسين تجربة الضيوف.';
    }
    
    return {
      ...response,
      message: {
        ...response.message,
        content: enhancedContent
      }
    };
  }
  
  static logValidationResults(validationResult: any, context: any): void {
    if (!validationResult.isValid) {
      console.warn('⚠️ Response validation issues detected:', {
        issues: validationResult.issues,
        suggestions: validationResult.suggestions,
        context: {
          hasConversationData: !!context.conversationData,
          messageLength: context.userMessage?.length || 0,
          responseLength: context.response?.message?.content?.length || 0
        }
      });
    } else {
      console.log('✅ Response validation passed');
    }
  }
}