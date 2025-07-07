export class EnhancedErrorHandler {
  static formatUserFriendlyError(error: any, context: string = ''): string {
    console.log('🚨 Formatting user-friendly error:', { error: error.message, context });
    
    // Base message in Arabic
    let message = 'أعتذر، ';
    
    if (error.message?.includes('OpenAI') || error.message?.includes('API')) {
      message += 'هناك مشكلة مؤقتة في خدمة الذكاء الاصطناعي. يرجى المحاولة مرة أخرى خلال دقائق قليلة.';
    } else if (error.message?.includes('Search') || error.message?.includes('Google')) {
      message += 'خدمة البحث غير متاحة حالياً. يمكنني مساعدتك بالمعلومات المتوفرة في قاعدة البيانات أو يمكنك الاتصال بالفندق مباشرة للحصول على معلومات حديثة.';
    } else if (error.message?.includes('Database') || error.message?.includes('Supabase')) {
      message += 'هناك مشكلة مؤقتة في الوصول للبيانات. سأساعدك بالمعلومات العامة وأنصحك بالاتصال بالفندق للتفاصيل الحديثة.';
    } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
      message += 'الطلب يستغرق وقتاً أطول من المتوقع. يرجى تبسيط سؤالك أو المحاولة مرة أخرى.';
    } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      message += 'النظام مزدحم حالياً. يرجى المحاولة مرة أخرى خلال دقيقة.';
    } else {
      message += 'واجهت مشكلة في معالجة طلبك. يرجى إعادة صياغة سؤالك أو المحاولة مرة أخرى.';
    }
    
    // Add helpful suggestions based on context
    if (context.includes('hotel') || context.includes('booking')) {
      message += '\n\n💡 يمكنك دائماً الاتصال بفندق Two Seasons مباشرة للحصول على مساعدة فورية.';
    }
    
    return message;
  }
  
  static createErrorResponse(error: any, messageId?: string, context?: string): any {
    const userFriendlyMessage = this.formatUserFriendlyError(error, context);
    
    return {
      response: userFriendlyMessage,
      messageId: messageId || 'error-' + Date.now(),
      timestamp: new Date().toISOString(),
      consultant: 'Two Seasons Hotel AI Consultant',
      error: true,
      errorType: error.constructor.name,
      canRetry: !error.message?.includes('configuration') && !error.message?.includes('credentials'),
      retryDelay: error.message?.includes('rate limit') ? 60 : 5,
      suggestedAction: this.getSuggestedAction(error)
    };
  }
  
  private static getSuggestedAction(error: any): string {
    if (error.message?.includes('Search')) {
      return 'contact_hotel_directly';
    } else if (error.message?.includes('Database')) {
      return 'try_general_questions';
    } else if (error.message?.includes('timeout')) {
      return 'simplify_question';
    } else if (error.message?.includes('rate limit')) {
      return 'wait_and_retry';
    }
    return 'rephrase_question';
  }
  
  static logDetailedError(error: any, context: any): void {
    console.error('🚨 Detailed error logging:', {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      context: {
        messageId: context.messageId,
        sessionId: context.sessionId,
        queryType: context.queryType,
        hasUserHistory: !!context.userHistory,
        functionName: context.functionName
      },
      environment: {
        hasOpenAIKey: !!Deno.env.get('OPENAI_API_KEY'),
        hasGoogleKey: !!Deno.env.get('GOOGLE_API_KEY'),
        hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL')
      }
    });
  }
}