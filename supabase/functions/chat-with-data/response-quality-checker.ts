// Response Quality Checker - Evaluates response completeness and consultant quality
export class ResponseQualityChecker {

  static checkResponseCompleteness(content: string, availableData: any): {
    issues: string[];
    suggestions: string[];
    qualityScore: number;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let qualityScore = 1.0; // Start with perfect score

    // Check response length appropriateness
    if (content.length < 100 && availableData) {
      issues.push('Response too short - insufficient analysis of available data');
      suggestions.push('Provide comprehensive analysis using available database information');
      qualityScore -= 0.3;
    }

    if (content.length > 1500) {
      issues.push('Response too long - may overwhelm user');
      suggestions.push('Condense to key insights and actionable recommendations');
      qualityScore -= 0.2;
    }

    // Check for consultant personality and proactive insights
    const consultantKeywords = [
      'recommend', 'suggest', 'analyze', 'insight', 'strategy',
      'أوصي', 'أقترح', 'تحليل', 'رؤية', 'استراتيجية'
    ];
    
    if (!consultantKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
      suggestions.push('Add consultative insights and recommendations');
      qualityScore -= 0.2;
    }

    // Check for proactive follow-up questions
    const hasFollowUpQuestion = content.includes('?') || content.includes('؟');
    if (!hasFollowUpQuestion && availableData) {
      suggestions.push('Add proactive follow-up questions to continue the conversation');
      qualityScore -= 0.1;
    }

    // Ensure score is within bounds
    qualityScore = Math.max(0, Math.min(1, qualityScore));

    return {
      issues,
      suggestions,
      qualityScore
    };
  }

  static calculateOverallQuality(
    dataScore: number,
    contextScore: number,
    qualityScore: number,
    fabricationScore: number
  ): {
    overallScore: number;
    breakdown: {
      dataUtilization: number;
      conversationContext: number;
      responseQuality: number;
      dataIntegrity: number;
    };
    grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  } {
    const breakdown = {
      dataUtilization: dataScore,
      conversationContext: contextScore,
      responseQuality: qualityScore,
      dataIntegrity: fabricationScore
    };

    // Weighted average with data integrity being most important
    const overallScore = (
      fabricationScore * 0.4 +  // Data integrity is critical
      dataScore * 0.3 +         // Data utilization important
      qualityScore * 0.2 +      // Response quality
      contextScore * 0.1        // Context continuity
    );

    let grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    if (overallScore >= 0.8) {
      grade = 'EXCELLENT';
    } else if (overallScore >= 0.6) {
      grade = 'GOOD';
    } else if (overallScore >= 0.4) {
      grade = 'FAIR';
    } else {
      grade = 'POOR';
    }

    return {
      overallScore,
      breakdown,
      grade
    };
  }
}