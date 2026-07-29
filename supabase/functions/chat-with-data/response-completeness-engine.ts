import { SmartResponseValidator } from './smart-response-validator.ts';
import { detectFabricatedMetrics } from './data-fabrication-detector.ts';
import { LanguageDetector } from './language-detector.ts';

export class ResponseCompletenessEngine {
  static async enforceDataHonesty(
    response: any,
    userMessage: string,
    conversationData: any,
    availableData: any,
    context: string,
    consultantPrompt: string,
    callOpenAI: Function
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

    // Check for fabrication (major issue) — the wholesale-replacement fallback
    // below is only allowed to fire when the answer actually states one of
    // the genuinely-unavailable metrics (occupancy/ADR/RevPAR/revenue) with a
    // number. A merely low utilization score is not itself grounds to nuke
    // the whole answer with hardcoded fallback text.
    const answerContent = response.message?.content || '';
    const fabricatedMetrics = detectFabricatedMetrics(answerContent);
    const hasFabrication = fabricatedMetrics.length > 0;

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
        const regeneratedResponse = await callOpenAI(context, userMessage, honestyPrompt);
        
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
        } else if (hasFabrication) {
          console.log('⚠️ Fallback: Creating honest response manually');
          return this.createHonestFallbackResponse(response, fabricatedMetrics, userMessage);
        }
        return response;
      } catch (error) {
        console.error('❌ Error regenerating honest response:', error);
        if (hasFabrication) {
          return this.createHonestFallbackResponse(response, fabricatedMetrics, userMessage);
        }
        return response;
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
  
  // Arabic labels for the metric keys `detectFabricatedMetrics` returns
  // ('occupancy' | 'adr' | 'revpar' | 'revenue'), used only to render the
  // Arabic fallback copy below.
  private static readonly ARABIC_METRIC_LABELS: Record<string, string> = {
    occupancy: 'الإشغال',
    adr: 'متوسط سعر الغرفة (ADR)',
    revpar: 'العائد لكل غرفة متاحة (RevPAR)',
    revenue: 'الإيرادات'
  };

  // Wholesale-replacement fallback: this bypasses the model entirely (unlike
  // `buildHonestyEnforcementPrompt`, whose text the model renders in the
  // conversation's language), so the language must be picked explicitly here
  // from the user's message rather than hardcoded to Arabic. Only called
  // when `detectFabricatedMetrics` actually flagged a real unavailable
  // metric, so `fabricatedMetrics` is always non-empty here.
  private static createHonestFallbackResponse(
    response: any,
    fabricatedMetrics: string[],
    userMessage: string
  ): any {
    console.log('🔧 Creating honest fallback response...');

    const language = LanguageDetector.detectLanguage(userMessage);

    const honestyContent = language === 'Arabic'
      ? `لا أملك بيانات موثوقة عن ${fabricatedMetrics.map(m => this.ARABIC_METRIC_LABELS[m] || m).join('، ')} في الجداول المتصلة، لذلك لن أذكر أي أرقام لها. يمكنني الإجابة استنادًا إلى المراجعات، ومحادثات واتساب، ورسائل بريد الضيوف، وأسعار المنافسين، والتفاعل على وسائل التواصل الاجتماعي، ورسائل الترحيب، وسجلات التدريب.`
      : `I don't have verified data for ${fabricatedMetrics.join(', ')} in my connected tables, so I won't quote numbers for it. I can answer from reviews, WhatsApp chats, guest emails, competitor rates, social engagement, welcome messages, and training records.`;

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