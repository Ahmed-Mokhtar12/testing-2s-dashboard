export class SmartResponseValidator {
  static validateAIResponse(response: any, userMessage: string, conversationData: any, availableData?: any): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
    dataUtilizationScore: number;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    if (!response) {
      issues.push('No response generated');
      return { isValid: false, issues, suggestions, dataUtilizationScore: 0 };
    }
    
    const content = response.message?.content || '';
    let dataUtilizationScore = 0.5; // Base score
    
    // CRITICAL: Check for DATA HONESTY vs FABRICATION
    if (availableData) {
      const hasReviewData = availableData.reviews && availableData.reviews.length > 0;
      const hasAnalyticsData = availableData.analytics && availableData.analytics.totalReviews > 0;
      
      // Check for FABRICATED OPERATIONAL DATA (Major Issue)
      const fabricationIndicators = [
        /occupancy.{0,20}\d+%/i,
        /adr.{0,20}\$?\d+/i,
        /revenue.{0,20}\$?\d+/i,
        /\d+%.*occupancy/i,
        /average daily rate.{0,20}\d+/i,
        /revpar.{0,20}\d+/i,
        /booking.*\d+/i
      ];
      
      const containsFabrication = fabricationIndicators.some(pattern => pattern.test(content));
      if (containsFabrication) {
        issues.push('CRITICAL: AI fabricated operational data that does not exist in database');
        suggestions.push('AI must request missing data instead of fabricating it');
        dataUtilizationScore = 0.0; // Severe penalty for fabrication
      }
      
      // Reward HONEST responses about data limitations
      const honestyIndicators = [
        'لا أملك',
        'غير متوفر',
        'أحتاج بيانات',
        'don\'t have',
        'not available',
        'need data'
      ];
      
      const isHonestAboutLimitations = honestyIndicators.some(phrase => 
        content.toLowerCase().includes(phrase.toLowerCase())
      );
      
      if (isHonestAboutLimitations && !containsFabrication) {
        dataUtilizationScore += 0.4; // Reward honesty
      }
      
      if (hasReviewData || hasAnalyticsData) {
        // Check if AI properly used available review data
        const reviewCount = availableData.reviews?.length || availableData.analytics?.totalReviews || 0;
        const avgScore = availableData.analytics?.averageScore;
        
        if (reviewCount > 0) {
          const hasCountReference = content.includes(reviewCount.toString()) || 
                                  content.includes('review') || 
                                  content.includes('مراجعة');
          
          if (hasCountReference && !containsFabrication) {
            dataUtilizationScore += 0.3; // Reward proper use of available data
          }
        }
        
        if (avgScore && avgScore > 0) {
          const hasScoreReference = content.includes(avgScore.toFixed(1)) || 
                                   content.includes('score') || 
                                   content.includes('rating') ||
                                   content.includes('نقاط') ||
                                   content.includes('تقييم');
          
          if (hasScoreReference && !containsFabrication) {
            dataUtilizationScore += 0.2; // Reward proper use of available data
          }
        }
      }
    }
    
    // Check for conversation continuity
    if (conversationData.recentDataPoints?.size > 0) {
      const hasScoreReference = conversationData.recentDataPoints.has('recent_score');
      const hasTimeReference = conversationData.recentDataPoints.has('time_period');
      
      // If user asked about recently mentioned data
      if (userMessage.includes('that score') || userMessage.includes('this data')) {
        if (hasScoreReference && !content.includes(conversationData.recentDataPoints.get('recent_score'))) {
          issues.push('Response does not reference recently mentioned score');
          suggestions.push(`Reference the score: ${conversationData.recentDataPoints.get('recent_score')}`);
          dataUtilizationScore -= 0.2;
        }
      }
      
      if (userMessage.includes('that month') || userMessage.includes('that period')) {
        if (hasTimeReference && !content.includes(conversationData.recentDataPoints.get('time_period'))) {
          issues.push('Response does not reference recently mentioned time period');
          suggestions.push(`Reference the period: ${conversationData.recentDataPoints.get('time_period')}`);
          dataUtilizationScore -= 0.2;
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
    
    // Check response completeness and intelligence
    if (content.length < 100 && availableData) {
      issues.push('Response too short - insufficient analysis of available data');
      suggestions.push('Provide comprehensive analysis using available database information');
      dataUtilizationScore -= 0.2;
    }
    
    if (content.length > 1500) {
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
      'need more information',
      'أي نقاط',
      'أي بيانات',
      'أي شهر'
    ];
    
    if (clarificationPhrases.some(phrase => content.toLowerCase().includes(phrase))) {
      if (conversationData.recentDataPoints?.size > 0 || availableData) {
        issues.push('Asking for clarification despite having available data');
        suggestions.push('Use available data and conversation memory instead of asking for clarification');
        dataUtilizationScore -= 0.3;
      }
    }
    
    // Check for consultant personality and proactive insights
    const consultantKeywords = ['recommend', 'suggest', 'analyze', 'insight', 'strategy', 'أوصي', 'أقترح', 'تحليل', 'رؤية', 'استراتيجية'];
    if (!consultantKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
      suggestions.push('Add consultative insights and recommendations');
      dataUtilizationScore -= 0.1;
    }
    
    // Check for proactive follow-up questions
    const hasFollowUpQuestion = content.includes('?') || content.includes('؟');
    if (!hasFollowUpQuestion && availableData) {
      suggestions.push('Add proactive follow-up questions to continue the conversation');
    }
    
    // Ensure score is within bounds
    dataUtilizationScore = Math.max(0, Math.min(1, dataUtilizationScore));
    
    return {
      isValid: issues.length === 0 && dataUtilizationScore > 0.6,
      issues,
      suggestions,
      dataUtilizationScore
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