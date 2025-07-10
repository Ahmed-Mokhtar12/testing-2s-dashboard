// Honest Response Generator - Phase 2 of AI Data Integrity Plan
export class HonestResponseGenerator {

  static generateDataRequestResponse(
    userQuery: string,
    dataAvailability: any,
    availableData: any
  ): string {
    
    const { 
      canAnswerCompletely, 
      availableDataSources, 
      missingDataSources, 
      recommendedDataRequest,
      confidenceLevel 
    } = dataAvailability;

    // If we can answer completely with available data
    if (canAnswerCompletely && confidenceLevel === 'HIGH') {
      return this.generateCompleteResponse(userQuery, availableData, availableDataSources);
    }

    // If we have partial data but missing key operational data
    if (!canAnswerCompletely && missingDataSources.length > 0) {
      return this.generatePartialResponseWithDataRequest(
        userQuery, 
        availableData, 
        availableDataSources, 
        recommendedDataRequest
      );
    }

    // If we have very limited data
    if (confidenceLevel === 'LOW') {
      return this.generateLowConfidenceResponse(userQuery, recommendedDataRequest);
    }

    // Default honest response
    return this.generateDefaultHonestResponse(userQuery, availableDataSources);
  }

  private static generateCompleteResponse(
    userQuery: string, 
    availableData: any, 
    availableDataSources: string[]
  ): string {
    const reviewCount = availableData?.hotelReviews?.value?.data?.length || 0;
    const avgScore = this.calculateAverageScore(availableData?.hotelReviews?.value?.data || []);
    
    if (availableDataSources.includes('guest_reviews') && reviewCount > 0) {
      return `✅ بناءً على تحليل البيانات المتاحة، وجدت ${reviewCount} مراجعة ضيوف في قاعدة البيانات${avgScore ? ` بمتوسط تقييم ${avgScore.toFixed(1)}/5` : ''}.\n\nيمكنني تقديم تحليل مفصل بناءً على هذه المراجعات. ما الجانب الذي تريد التركيز عليه أكثر؟`;
    }

    return `✅ يمكنني الإجابة على استفسارك بناءً على البيانات المتاحة في قاعدة البيانات.`;
  }

  private static generatePartialResponseWithDataRequest(
    userQuery: string,
    availableData: any,
    availableDataSources: string[],
    dataRequest: string | null
  ): string {
    const reviewCount = availableData?.hotelReviews?.value?.data?.length || 0;
    const avgScore = this.calculateAverageScore(availableData?.hotelReviews?.value?.data || []);
    
    let response = '';

    // Start with what we DO have
    if (availableDataSources.includes('guest_reviews') && reviewCount > 0) {
      response += `📊 بناءً على البيانات المتاحة في قاعدة البيانات، لدي ${reviewCount} مراجعة ضيوف${avgScore ? ` بمتوسط تقييم ${avgScore.toFixed(1)}/5` : ''}.\n\n`;
      
      // Analyze what we can tell from reviews
      response += `يمكنني تحليل:\n`;
      response += `• آراء الضيوف وملاحظاتهم\n`;
      response += `• نقاط القوة والضعف من وجهة نظر الضيوف\n`;
      response += `• الاتجاهات في التقييمات\n`;
      response += `• المشاكل المتكررة والمقترحات\n\n`;
    }

    // Be honest about what we DON'T have
    response += `⚠️ لكن لإجابة كاملة ودقيقة على استفسارك، أحتاج إلى بيانات إضافية غير متوفرة في قاعدة البيانات:\n\n`;
    
    if (dataRequest) {
      response += dataRequest;
    }

    response += `\n\n💡 **خيارات أخرى:**\n`;
    response += `• يمكنني تحليل البيانات المتاحة وتقديم رؤى بناءً على مراجعات الضيوف\n`;
    response += `• يمكنك رفع المستندات التي تحتوي على البيانات المطلوبة\n`;
    response += `• يمكنك تزويدي بالأرقام المحددة وسأساعدك في تحليلها\n\n`;
    response += `أي من هذه الخيارات تفضل؟`;

    return response;
  }

  private static generateLowConfidenceResponse(
    userQuery: string,
    dataRequest: string | null
  ): string {
    let response = `🤔 أعتذر، لكن لا أملك البيانات الكافية في قاعدة البيانات للإجابة على استفسارك بدقة.\n\n`;
    
    if (dataRequest) {
      response += `للحصول على إجابة دقيقة ومفيدة، أحتاج إلى:\n\n${dataRequest}\n\n`;
    }

    response += `💡 **كيف يمكنني مساعدتك:**\n`;
    response += `• رفع المستندات أو البيانات ذات الصلة\n`;
    response += `• تزويدي بالمعلومات المحددة وسأساعدك في تحليلها\n`;
    response += `• إعادة صياغة السؤال ليتناسب مع البيانات المتاحة\n\n`;
    response += `هل يمكنك مساعدتي بأي من هذه الطرق؟`;

    return response;
  }

  private static generateDefaultHonestResponse(
    userQuery: string,
    availableDataSources: string[]
  ): string {
    return `أقدر استفسارك وأريد أن أكون صادقاً معك بشأن ما يمكنني تقديمه.\n\nبناءً على البيانات المتاحة حالياً، يمكنني مساعدتك في تحليل الجوانب التالية:\n${this.listAvailableAnalysis(availableDataSources)}\n\nهل تريد التركيز على أي من هذه النواحي، أم تفضل تزويدي ببيانات إضافية للحصول على تحليل أشمل؟`;
  }

  private static listAvailableAnalysis(availableDataSources: string[]): string {
    const analyses: string[] = [];
    
    if (availableDataSources.includes('guest_reviews')) {
      analyses.push('• تحليل مراجعات وآراء الضيوف');
      analyses.push('• تحديد نقاط القوة والمجالات التي تحتاج تحسين');
      analyses.push('• الاتجاهات في رضا الضيوف');
    }
    
    if (availableDataSources.includes('uploaded_documents')) {
      analyses.push('• تحليل المستندات والسياسات المرفوعة');
    }
    
    if (availableDataSources.includes('training_records')) {
      analyses.push('• مراجعة سجلات التدريب');
    }

    if (analyses.length === 0) {
      analyses.push('• تقديم إرشادات عامة بناءً على أفضل الممارسات في صناعة الضيافة');
    }

    return analyses.join('\n');
  }

  private static calculateAverageScore(reviews: any[]): number | null {
    if (!reviews || reviews.length === 0) return null;
    
    const reviewsWithScores = reviews.filter(r => r.Score && typeof r.Score === 'number');
    if (reviewsWithScores.length === 0) return null;
    
    const sum = reviewsWithScores.reduce((total, review) => total + review.Score, 0);
    return sum / reviewsWithScores.length;
  }

  static generateAlternativeAnalysisOffer(userQuery: string, availableData: any): string {
    const queryLower = userQuery.toLowerCase();
    const suggestions: string[] = [];

    // If they asked for operational data but we have reviews
    if ((queryLower.includes('occupancy') || queryLower.includes('revenue') || queryLower.includes('adr')) 
        && availableData?.hotelReviews?.value?.data?.length > 0) {
      suggestions.push('تحليل رضا الضيوف كمؤشر على الأداء العام');
      suggestions.push('تحديد العوامل التي تؤثر على تجربة الضيوف (قد تؤثر على الإشغال)');
      suggestions.push('مراجعة الشكاوى والاقتراحات للتحسين');
    }

    if (queryLower.includes('performance') && availableData?.hotelReviews?.value?.data?.length > 0) {
      suggestions.push('تقييم الأداء بناءً على مراجعات الضيوف');
      suggestions.push('مقارنة التقييمات عبر الفترات الزمنية');
      suggestions.push('تحليل نقاط القوة والضعف');
    }

    if (suggestions.length > 0) {
      return `\n\n🔄 **كبديل، يمكنني تقديم:**\n${suggestions.map(s => `• ${s}`).join('\n')}`;
    }

    return '';
  }
}