import { SmartResponseValidator } from './smart-response-validator.ts';

export class ResponseCompletenessEngine {
  static async enforceDataIncorporation(
    response: any,
    userMessage: string,
    conversationData: any,
    availableData: any,
    context: string,
    consultantPrompt: string,
    callOpenAI: Function
  ): Promise<any> {
    console.log('🎯 Response Completeness Engine: Checking data incorporation...');
    
    // Validate the response for data utilization
    const validationResult = SmartResponseValidator.validateAIResponse(
      response, 
      userMessage, 
      conversationData, 
      availableData
    );
    
    console.log(`📊 Data utilization score: ${validationResult.dataUtilizationScore}`);
    
    // If data utilization is poor, regenerate response
    if (validationResult.dataUtilizationScore < 0.6 || validationResult.issues.length > 0) {
      console.log('🔄 Response incomplete - regenerating with data enforcement...');
      
      // Create enhanced prompt that forces data incorporation
      const dataEnforcementPrompt = this.buildDataEnforcementPrompt(
        consultantPrompt,
        availableData,
        userMessage,
        validationResult
      );
      
      try {
        // Regenerate response with stronger data enforcement
        const regeneratedResponse = await callOpenAI(context, userMessage, dataEnforcementPrompt);
        
        // Validate the regenerated response
        const revalidationResult = SmartResponseValidator.validateAIResponse(
          regeneratedResponse,
          userMessage,
          conversationData,
          availableData
        );
        
        console.log(`🔄 Regenerated response data utilization: ${revalidationResult.dataUtilizationScore}`);
        
        if (revalidationResult.dataUtilizationScore > validationResult.dataUtilizationScore) {
          console.log('✅ Regenerated response is better - using improved version');
          return regeneratedResponse;
        } else {
          console.log('⚠️ Regenerated response not significantly better - enhancing original');
          return this.enhanceResponseWithData(response, availableData, userMessage);
        }
      } catch (error) {
        console.error('❌ Error regenerating response:', error);
        return this.enhanceResponseWithData(response, availableData, userMessage);
      }
    }
    
    return response;
  }
  
  private static buildDataEnforcementPrompt(
    originalPrompt: string,
    availableData: any,
    userMessage: string,
    validationResult: any
  ): string {
    let dataContext = '';
    
    if (availableData) {
      const reviewCount = availableData.reviews?.length || availableData.analytics?.totalReviews || 0;
      const avgScore = availableData.analytics?.averageScore;
      
      dataContext = `
🚨 CRITICAL DATA INCORPORATION REQUIREMENTS:
- You HAVE ${reviewCount} reviews in the database
- Average score is ${avgScore ? avgScore.toFixed(1) + '/5' : 'calculated from reviews'}
- You MUST mention these specific numbers in your response
- NEVER say "retrieving data" or "getting information" - you HAVE the data
- Provide complete analysis using these exact numbers
- Add specific insights based on the data patterns
- Generate proactive follow-up questions

VALIDATION ISSUES TO FIX:
${validationResult.issues.join('\n- ')}

REQUIRED IMPROVEMENTS:
${validationResult.suggestions.join('\n- ')}

USER QUESTION: "${userMessage}"

RESPONSE REQUIREMENTS:
1. Start with specific data: "وجدت ${reviewCount} مراجعة في قاعدة البيانات..."
2. Include exact average score if available
3. Provide data-driven insights and analysis
4. Add consultant recommendations
5. End with relevant follow-up question
6. Be conversational and engaging like a smart consultant
`;
    }
    
    return originalPrompt + dataContext;
  }
  
  private static enhanceResponseWithData(
    response: any,
    availableData: any,
    userMessage: string
  ): any {
    console.log('🔧 Enhancing response with available data...');
    
    let enhancedContent = response.message?.content || '';
    
    if (availableData) {
      const reviewCount = availableData.reviews?.length || availableData.analytics?.totalReviews || 0;
      const avgScore = availableData.analytics?.averageScore;
      
      if (reviewCount > 0) {
        // Add data summary at the beginning
        const dataSummary = `📊 بناءً على تحليل قاعدة البيانات، وجدت ${reviewCount} مراجعة${avgScore ? ` بمتوسط تقييم ${avgScore.toFixed(1)}/5` : ''}.\n\n`;
        
        enhancedContent = dataSummary + enhancedContent;
        
        // Add consultant insight
        if (!enhancedContent.includes('أوصي') && !enhancedContent.includes('أقترح')) {
          enhancedContent += '\n\n💡 توصيتي: هذه البيانات تشير إلى اتجاهات مهمة في تجربة الضيوف. هل تريد تحليلاً أعمق لأي جانب معين؟';
        }
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