export class CustomerBehaviorAnalytics {
  
  static analyzeReviewSentiment(reviews: any[]): any {
    console.log('📊 Analyzing review sentiment patterns...');
    
    const sentimentData = {
      overall: { positive: 0, neutral: 0, negative: 0 },
      monthly: {} as Record<string, { positive: number, neutral: number, negative: number, avgScore: number }>,
      platforms: {} as Record<string, { positive: number, neutral: number, negative: number, count: number }>,
      trends: {
        recentDrop: false,
        improvingTrend: false,
        consistentQuality: false
      }
    };

    reviews.forEach(review => {
      const score = review.Score || 0;
      const source = review.Source || 'Unknown';
      const date = review.Date;
      
      // Sentiment classification
      let sentiment = 'neutral';
      if (score >= 4) sentiment = 'positive';
      else if (score <= 2) sentiment = 'negative';
      
      // Overall sentiment
      sentimentData.overall[sentiment as keyof typeof sentimentData.overall]++;
      
      // Platform analysis
      if (!sentimentData.platforms[source]) {
        sentimentData.platforms[source] = { positive: 0, neutral: 0, negative: 0, count: 0 };
      }
      sentimentData.platforms[source][sentiment as keyof typeof sentimentData.platforms[typeof source]]++;
      sentimentData.platforms[source].count++;
      
      // Monthly trends
      if (date) {
        const monthKey = date.substring(0, 7); // YYYY-MM
        if (!sentimentData.monthly[monthKey]) {
          sentimentData.monthly[monthKey] = { positive: 0, neutral: 0, negative: 0, avgScore: 0 };
        }
        sentimentData.monthly[monthKey][sentiment as keyof typeof sentimentData.monthly[typeof monthKey]]++;
      }
    });

    // Calculate monthly averages
    Object.keys(sentimentData.monthly).forEach(month => {
      const monthReviews = reviews.filter(r => r.Date && r.Date.startsWith(month) && r.Score);
      if (monthReviews.length > 0) {
        sentimentData.monthly[month].avgScore = 
          monthReviews.reduce((sum, r) => sum + r.Score, 0) / monthReviews.length;
      }
    });

    // Analyze trends
    const monthlyScores = Object.entries(sentimentData.monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, data]) => data.avgScore)
      .filter(score => score > 0);

    if (monthlyScores.length >= 3) {
      const recent3 = monthlyScores.slice(-3);
      const previous3 = monthlyScores.slice(-6, -3);
      
      if (previous3.length > 0) {
        const recentAvg = recent3.reduce((a, b) => a + b) / recent3.length;
        const previousAvg = previous3.reduce((a, b) => a + b) / previous3.length;
        
        sentimentData.trends.recentDrop = recentAvg < previousAvg - 0.3;
        sentimentData.trends.improvingTrend = recentAvg > previousAvg + 0.2;
        sentimentData.trends.consistentQuality = Math.abs(recentAvg - previousAvg) < 0.1;
      }
    }

    console.log('✅ Sentiment analysis complete:', {
      totalReviews: reviews.length,
      overallPositive: sentimentData.overall.positive,
      platformCount: Object.keys(sentimentData.platforms).length
    });

    return sentimentData;
  }

  static analyzeGuestBehaviorPatterns(reviews: any[], chatHistory: any[]): any {
    console.log('🔍 Analyzing guest behavior patterns...');
    
    const patterns = {
      satisfactionDrivers: {
        highScoreKeywords: [] as string[],
        lowScoreKeywords: [] as string[]
      },
      communicationPatterns: {
        immediateResponseNeeded: 0,
        planningGuests: 0,
        complaintsEscalated: 0
      },
      loyaltyIndicators: {
        repeatPhrases: [] as string[],
        recommendationRate: 0,
        returningGuestSignals: 0
      },
      operationalInsights: {
        peakComplaintTimes: {} as Record<string, number>,
        serviceMentions: {} as Record<string, { positive: number, negative: number }>,
        staffMentions: {} as Record<string, number>
      }
    };

    // Analyze review content for satisfaction drivers
    const highScoreReviews = reviews.filter(r => r.Score >= 4);
    const lowScoreReviews = reviews.filter(r => r.Score <= 2);

    // Extract keywords from high/low score reviews
    const extractKeywords = (reviewText: string): string[] => {
      if (!reviewText) return [];
      const words = reviewText.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && 
          !['the', 'and', 'was', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'his', 'she', 'that', 'they', 'this', 'were', 'will', 'with'].includes(word));
      return words;
    };

    // Analyze high score keywords
    const highScoreKeywords: Record<string, number> = {};
    highScoreReviews.forEach(review => {
      const text = (review.Title || '') + ' ' + (review['Reviews Summary'] || '');
      extractKeywords(text).forEach(keyword => {
        highScoreKeywords[keyword] = (highScoreKeywords[keyword] || 0) + 1;
      });
    });

    // Analyze low score keywords
    const lowScoreKeywords: Record<string, number> = {};
    lowScoreReviews.forEach(review => {
      const text = (review.Title || '') + ' ' + (review['Reviews Summary'] || '');
      extractKeywords(text).forEach(keyword => {
        lowScoreKeywords[keyword] = (lowScoreKeywords[keyword] || 0) + 1;
      });
    });

    // Get top keywords
    patterns.satisfactionDrivers.highScoreKeywords = Object.entries(highScoreKeywords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);

    patterns.satisfactionDrivers.lowScoreKeywords = Object.entries(lowScoreKeywords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);

    // Analyze chat patterns
    chatHistory.forEach(chat => {
      const message = (chat['Sender Message'] || '').toLowerCase();
      const reply = (chat['Ai Reply'] || '').toLowerCase();
      
      if (message.includes('urgent') || message.includes('immediately') || message.includes('asap')) {
        patterns.communicationPatterns.immediateResponseNeeded++;
      }
      
      if (message.includes('planning') || message.includes('book') || message.includes('reservation')) {
        patterns.communicationPatterns.planningGuests++;
      }
      
      if (message.includes('complaint') || message.includes('problem') || message.includes('issue')) {
        patterns.communicationPatterns.complaintsEscalated++;
      }
    });

    // Service mentions analysis
    const serviceTerms = ['pool', 'restaurant', 'gym', 'spa', 'wifi', 'breakfast', 'room', 'staff', 'service', 'location', 'parking'];
    
    reviews.forEach(review => {
      const text = ((review.Title || '') + ' ' + (review['Reviews Summary'] || '')).toLowerCase();
      const score = review.Score || 0;
      
      serviceTerms.forEach(service => {
        if (text.includes(service)) {
          if (!patterns.operationalInsights.serviceMentions[service]) {
            patterns.operationalInsights.serviceMentions[service] = { positive: 0, negative: 0 };
          }
          
          if (score >= 4) {
            patterns.operationalInsights.serviceMentions[service].positive++;
          } else if (score <= 2) {
            patterns.operationalInsights.serviceMentions[service].negative++;
          }
        }
      });
    });

    console.log('✅ Behavior pattern analysis complete:', {
      highScoreKeywords: patterns.satisfactionDrivers.highScoreKeywords.length,
      lowScoreKeywords: patterns.satisfactionDrivers.lowScoreKeywords.length,
      chatPatterns: patterns.communicationPatterns,
      serviceMentions: Object.keys(patterns.operationalInsights.serviceMentions).length
    });

    return patterns;
  }

  static generateManagementRecommendations(sentimentData: any, behaviorPatterns: any): any {
    console.log('💡 Generating management recommendations...');
    
    const recommendations = {
      immediate: [] as string[],
      shortTerm: [] as string[],
      longTerm: [] as string[],
      sopRevisions: [] as string[],
      staffTraining: [] as string[],
      operationalAdjustments: [] as string[]
    };

    // Immediate actions based on sentiment trends
    if (sentimentData.trends.recentDrop) {
      recommendations.immediate.push("Address the recent drop in guest satisfaction - investigate operational changes in the last 3 months");
      recommendations.immediate.push("Review recent staff schedules and training to identify potential service gaps");
    }

    // Platform-specific recommendations
    Object.entries(sentimentData.platforms).forEach(([platform, data]: [string, any]) => {
      const negativeRate = data.negative / (data.count || 1);
      if (negativeRate > 0.3) {
        recommendations.shortTerm.push(`${platform} shows high negative sentiment (${(negativeRate * 100).toFixed(1)}%) - review guest journey for this channel`);
      }
    });

    // Service-based recommendations
    Object.entries(behaviorPatterns.operationalInsights.serviceMentions).forEach(([service, mentions]: [string, any]) => {
      const negativeRate = mentions.negative / (mentions.positive + mentions.negative || 1);
      if (negativeRate > 0.4) {
        recommendations.sopRevisions.push(`${service.charAt(0).toUpperCase() + service.slice(1)} service needs attention - ${mentions.negative} negative vs ${mentions.positive} positive mentions`);
      }
    });

    // Satisfaction driver recommendations
    if (behaviorPatterns.satisfactionDrivers.highScoreKeywords.length > 0) {
      const topPositive = behaviorPatterns.satisfactionDrivers.highScoreKeywords.slice(0, 3);
      recommendations.longTerm.push(`Leverage top satisfaction drivers: ${topPositive.join(', ')} - enhance these experiences`);
    }

    if (behaviorPatterns.satisfactionDrivers.lowScoreKeywords.length > 0) {
      const topNegative = behaviorPatterns.satisfactionDrivers.lowScoreKeywords.slice(0, 3);
      recommendations.immediate.push(`Address primary pain points: ${topNegative.join(', ')} - create action plans for each`);
    }

    // Communication pattern recommendations
    if (behaviorPatterns.communicationPatterns.immediateResponseNeeded > 10) {
      recommendations.staffTraining.push("High volume of urgent guest requests suggests need for proactive service training");
    }

    if (behaviorPatterns.communicationPatterns.complaintsEscalated > 5) {
      recommendations.sopRevisions.push("Review complaint escalation procedures - multiple unresolved issues detected");
    }

    // Operational adjustments
    const totalNegative = sentimentData.overall.negative;
    const totalReviews = sentimentData.overall.positive + sentimentData.overall.neutral + sentimentData.overall.negative;
    
    if (totalReviews > 0) {
      const negativeRate = totalNegative / totalReviews;
      if (negativeRate > 0.15) {
        recommendations.operationalAdjustments.push(`Overall negative sentiment at ${(negativeRate * 100).toFixed(1)}% - implement guest recovery protocols`);
      }
    }

    console.log('✅ Management recommendations generated:', {
      immediate: recommendations.immediate.length,
      shortTerm: recommendations.shortTerm.length,
      longTerm: recommendations.longTerm.length,
      sopRevisions: recommendations.sopRevisions.length
    });

    return recommendations;
  }

  static formatInsightsForAI(sentimentData: any, behaviorPatterns: any, recommendations: any): string {
    console.log('📝 Formatting insights for AI consumption...');
    
    const insights = `🏨 CUSTOMER BEHAVIOR INSIGHTS & MANAGEMENT ADVISORY

📊 SENTIMENT OVERVIEW:
- Overall satisfaction: ${sentimentData.overall.positive} positive, ${sentimentData.overall.negative} negative reviews
- Platform performance: ${Object.entries(sentimentData.platforms).map(([platform, data]: [string, any]) => {
  const rate = (data.positive / (data.count || 1) * 100).toFixed(0);
  return `${platform} ${rate}% positive`;
}).join(', ')}
- Trends: ${sentimentData.trends.recentDrop ? 'Recent satisfaction drop detected' : 
            sentimentData.trends.improvingTrend ? 'Improving trend' : 'Stable performance'}

🎯 KEY SATISFACTION DRIVERS:
- What guests love: ${behaviorPatterns.satisfactionDrivers.highScoreKeywords.slice(0, 5).join(', ')}
- Pain points: ${behaviorPatterns.satisfactionDrivers.lowScoreKeywords.slice(0, 5).join(', ')}

🔍 OPERATIONAL INSIGHTS:
- Guest communication patterns: ${behaviorPatterns.communicationPatterns.immediateResponseNeeded} urgent requests, ${behaviorPatterns.communicationPatterns.complaintsEscalated} complaints escalated
- Service performance: ${Object.entries(behaviorPatterns.operationalInsights.serviceMentions).map(([service, data]: [string, any]) => {
  const total = data.positive + data.negative;
  const sentiment = total > 0 ? (data.positive / total * 100).toFixed(0) + '% positive' : 'no data';
  return `${service} (${sentiment})`;
}).slice(0, 5).join(', ')}

⚡ IMMEDIATE ACTIONS NEEDED:
${recommendations.immediate.map((rec: string) => `- ${rec}`).join('\n')}

🔧 SOP REVISIONS REQUIRED:
${recommendations.sopRevisions.map((rec: string) => `- ${rec}`).join('\n')}

💼 STAFF TRAINING PRIORITIES:
${recommendations.staffTraining.map((rec: string) => `- ${rec}`).join('\n')}

🎯 STRATEGIC RECOMMENDATIONS:
${recommendations.longTerm.map((rec: string) => `- ${rec}`).join('\n')}

---
AS YOUR SENIOR HOTEL CONSULTANT: Focus responses on actionable improvements and guest experience enhancement. Use this data to provide specific, data-driven recommendations that improve hotel performance.`;

    return insights;
  }
}