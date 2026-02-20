import { SmartResponseValidator } from './smart-response-validator.ts';

export class ResponseCompletenessEngine {
  static async enforceDataHonesty(
    response: any,
    userMessage: string,
    conversationData: any,
    availableData: any,
    context: string,
    consultantPrompt: string,
    callOpenAI: Function,
    conversationHistory?: Array<{user_message: string; ai_response: string}>
  ): Promise<any> {
    console.log('🎯 Response Honesty Engine: Checking for data integrity...');
    
    // Validate the response for data honesty and fabrication
    const validationResult = SmartResponseValidator.validateAIResponse(
      response, 
      userMessage, 
      conversationData, 
      availableData
    );
    
    console.log(`📊 Data honesty score: ${validationResult.dataUtilizationScore}`);
    
    // Check for fabrication (major issue)
    const hasFabrication = validationResult.issues.some(issue => 
      issue.includes('fabricated') || issue.includes('CRITICAL')
    );
    
    // If fabrication detected or low honesty score
    if (hasFabrication || validationResult.dataUtilizationScore < 0.3) {
      console.log('🚨 CRITICAL: Data fabrication detected - regenerating with honesty enforcement...');
      
      // Create honesty-enforced prompt
      const honestyPrompt = this.buildHonestyEnforcementPrompt(
        consultantPrompt,
        availableData,
        userMessage,
        validationResult
      );
      
      try {
        // Regenerate response with honesty enforcement
        const regeneratedResponse = await callOpenAI(context, userMessage, honestyPrompt, conversationHistory);
        
        // Validate the regenerated response
        const revalidationResult = SmartResponseValidator.validateAIResponse(
          regeneratedResponse,
          userMessage,
          conversationData,
          availableData
        );
        
        console.log(`🔄 Regenerated response honesty score: ${revalidationResult.dataUtilizationScore}`);
        
        // Accept regenerated response if it's more honest
        if (revalidationResult.dataUtilizationScore > validationResult.dataUtilizationScore) {
          console.log('✅ Regenerated response is more honest - using improved version');
          return regeneratedResponse;
        } else {
          console.log('⚠️ Fallback: Creating honest response manually');
          return this.createHonestFallbackResponse(response, availableData, userMessage);
        }
      } catch (error) {
        console.error('❌ Error regenerating honest response:', error);
        return this.createHonestFallbackResponse(response, availableData, userMessage);
      }
    }
    
    return response;
  }
  
  private static buildHonestyEnforcementPrompt(
    originalPrompt: string,
    availableData: any,
    userMessage: string,
    validationResult: any
  ): string {
    const reviewCount = availableData?.reviews?.length || availableData?.analytics?.totalReviews || 0;
    const avgScore = availableData?.analytics?.averageScore;
    
    const honestyContext = `
🚨 CRITICAL DATA HONESTY REQUIREMENTS:

AVAILABLE DATA ONLY:
- Guest reviews: ${reviewCount} reviews${avgScore ? ` (average: ${avgScore.toFixed(1)}/5)` : ''}
- Uploaded documents and conversation history
- Training records and email summaries

NOT AVAILABLE (NEVER FABRICATE):
- Occupancy rates, ADR, RevPAR, revenue data
- Booking statistics, room inventory
- Financial metrics, operational KPIs

VALIDATION ISSUES DETECTED:
${validationResult.issues.join('\n- ')}

HONESTY REQUIREMENTS:
${validationResult.suggestions.join('\n- ')}

USER QUESTION: "${userMessage}"

HONEST RESPONSE REQUIREMENTS:
1. If asking for unavailable data: "لا أملك بيانات [specific type] في قاعدة البيانات"
2. Request specific data: "أحتاج [specific data] لتقديم تحليل دقيق"  
3. Offer alternatives: "يمكنني تحليل [available data] بدلاً من ذلك"
4. Be helpful while being completely honest
5. Never fabricate numbers that don't exist
6. Use only verified data from database
`;
    
    return originalPrompt + honestyContext;
  }
  
  private static createHonestFallbackResponse(
    response: any,
    availableData: any,
    userMessage: string
  ): any {
    console.log('🔧 Creating honest fallback response...');
    
    const reviewCount = availableData?.reviews?.length || availableData?.analytics?.totalReviews || 0;
    const avgScore = availableData?.analytics?.averageScore;
    
    let honestyContent = '';
    
    // Check if user asked for operational data
    const askedForOperational = /occupancy|revenue|adr|booking|revpar|financial/i.test(userMessage);
    
    if (askedForOperational) {
      honestyContent = `أعتذر، لكن لا أملك البيانات التشغيلية المطلوبة في قاعدة البيانات.\n\n`;
      honestyContent += `📊 البيانات المتاحة:\n`;
      if (reviewCount > 0) {
        honestyContent += `• ${reviewCount} مراجعة ضيوف${avgScore ? ` (متوسط: ${avgScore.toFixed(1)}/5)` : ''}\n`;
      }
      honestyContent += `• المستندات المرفوعة\n`;
      honestyContent += `• سجلات التدريب والمحادثات\n\n`;
      
      honestyContent += `لتقديم تحليل دقيق، أحتاج إلى:\n`;
      honestyContent += `• بيانات الإشغال والإيرادات\n`;
      honestyContent += `• معدلات الأسعار اليومية\n`;
      honestyContent += `• إحصائيات الحجوزات\n\n`;
      
      honestyContent += `هل يمكنك تزويدي بهذه البيانات أو رفع المستندات التي تحتويها؟`;
    } else if (reviewCount > 0) {
      honestyContent = `بناءً على البيانات المتاحة في قاعدة البيانات، لدي ${reviewCount} مراجعة ضيوف${avgScore ? ` بمتوسط تقييم ${avgScore.toFixed(1)}/5` : ''}.\n\n`;
      honestyContent += `يمكنني تحليل:\n`;
      honestyContent += `• آراء الضيوف ومستوى رضاهم\n`;
      honestyContent += `• نقاط القوة والمجالات التي تحتاج تحسين\n`;
      honestyContent += `• الاتجاهات في التقييمات\n\n`;
      honestyContent += `ما الجانب الذي تريد التركيز عليه؟`;
    } else {
      honestyContent = `لا توجد بيانات كافية في قاعدة البيانات للإجابة على استفسارك.\n\n`;
      honestyContent += `لتقديم مساعدة فعّالة، يمكنك:\n`;
      honestyContent += `• رفع المستندات ذات الصلة\n`;
      honestyContent += `• تزويدي بالبيانات المحددة\n`;
      honestyContent += `• إعادة صياغة السؤال ليتناسب مع المعلومات العامة\n\n`;
      honestyContent += `كيف يمكنني مساعدتك؟`;
    }
    
    return {
      ...response,
      message: {
        ...response.message,
        content: honestyContent
      }
    };
  }
  
  static generateProactiveInsights(availableData: any, userMessage: string): string[] {
    const insights: string[] = [];
    
    if (availableData?.reviews && availableData.reviews.length > 0) {
      const reviewCount = availableData.reviews.length;
      const avgScore = availableData.analytics?.averageScore || 0;
      
      // Generate insights based on data patterns
      if (avgScore > 4) {
        insights.push('النتائج ممتازة! هل تريد تحليل العوامل التي تجعل تجربة الضيوف استثنائية؟');
      } else if (avgScore < 3) {
        insights.push('هناك فرص للتحسين. هل تريد استراتيجية لرفع مستوى رضا الضيوف؟');
      }
      
      if (reviewCount > 50) {
        insights.push('لديك حجم جيد من المراجعات للتحليل. هل تريد تقرير تفصيلي عن الاتجاهات؟');
      }
      
      // Add contextual insights based on user question
      if (userMessage.toLowerCase().includes('month') || userMessage.includes('شهر')) {
        insights.push('هل تريد مقارنة هذا الشهر مع الفترات السابقة؟');
      }
      
      if (userMessage.toLowerCase().includes('score') || userMessage.includes('تقييم')) {
        insights.push('هل تحتاج اقتراحات محددة لتحسين التقييمات؟');
      }
    }
    
    return insights;
  }
  
  static addInteractiveElements(content: string, availableData: any, userMessage: string): string {
    const insights = this.generateProactiveInsights(availableData, userMessage);
    
    if (insights.length > 0) {
      const randomInsight = insights[Math.floor(Math.random() * insights.length)];
      if (!content.includes('؟') && !content.includes('?')) {
        content += `\n\n${randomInsight}`;
      }
    }
    
    return content;
  }
}