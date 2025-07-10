// Response Enhancement Utils - Utilities for improving response quality
export class ResponseEnhancementUtils {

  static enhanceResponseWithContext(
    response: any,
    conversationData: any,
    validationIssues: string[]
  ): any {
    let enhancedContent = response.message?.content || '';

    // Add conversation context if missing
    if (validationIssues.includes('Response does not reference recently mentioned score')) {
      const score = conversationData.recentDataPoints?.get('recent_score');
      if (score) {
        enhancedContent = `بناءً على النتيجة ${score} التي ناقشناها، ${enhancedContent}`;
      }
    }

    if (validationIssues.includes('Response does not reference recently mentioned time period')) {
      const period = conversationData.recentDataPoints?.get('time_period');
      if (period) {
        enhancedContent = `في ${period} الذي تحدثنا عنه، ${enhancedContent}`;
      }
    }

    return {
      ...response,
      message: {
        ...response.message,
        content: enhancedContent
      }
    };
  }

  static addConsultantRecommendations(
    response: any,
    suggestions: string[]
  ): any {
    let enhancedContent = response.message?.content || '';

    // Add consultant recommendations if missing
    if (suggestions.includes('Add consultative insights and recommendations')) {
      enhancedContent += '\n\n💡 توصيتي: قم بمراجعة هذه النقاط مع فريق الإدارة لتحسين تجربة الضيوف.';
    }

    // Add follow-up questions if missing
    if (suggestions.includes('Add proactive follow-up questions to continue the conversation')) {
      enhancedContent += '\n\nهل تريد تحليلاً أعمق لأي جانب معين؟';
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
        scores: {
          dataUtilization: validationResult.dataUtilizationScore,
          overall: validationResult.overallScore || 'not calculated'
        },
        context: {
          hasConversationData: !!context.conversationData,
          messageLength: context.userMessage?.length || 0,
          responseLength: context.response?.message?.content?.length || 0
        }
      });
    } else {
      console.log('✅ Response validation passed', {
        dataUtilizationScore: validationResult.dataUtilizationScore
      });
    }
  }
}