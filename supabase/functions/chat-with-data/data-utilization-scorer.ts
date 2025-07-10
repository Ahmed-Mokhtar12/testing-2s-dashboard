// Data Utilization Scorer - Evaluates how well AI uses available data
export class DataUtilizationScorer {

  static scoreDataUtilization(
    content: string,
    availableData: any,
    fabricationResult: any
  ): {
    score: number;
    breakdown: {
      baseScore: number;
      fabricationPenalty: number;
      honestyReward: number;
      dataUsageReward: number;
    };
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    let score = 0.5; // Base score
    const breakdown = {
      baseScore: 0.5,
      fabricationPenalty: 0,
      honestyReward: 0,
      dataUsageReward: 0
    };

    // Apply fabrication penalty/honesty reward
    if (fabricationResult.containsFabrication) {
      breakdown.fabricationPenalty = -0.5;
      score = 0.0;
    } else if (fabricationResult.isHonestAboutLimitations) {
      breakdown.honestyReward = 0.4;
      score += 0.4;
    }

    // Check usage of available review data
    if (availableData) {
      const hasReviewData = availableData.reviews && availableData.reviews.length > 0;
      const hasAnalyticsData = availableData.analytics && availableData.analytics.totalReviews > 0;

      if (hasReviewData || hasAnalyticsData) {
        const reviewCount = availableData.reviews?.length || availableData.analytics?.totalReviews || 0;
        const avgScore = availableData.analytics?.averageScore;

        // Check review count usage
        if (reviewCount > 0) {
          const hasCountReference = content.includes(reviewCount.toString()) || 
                                  content.includes('review') || 
                                  content.includes('مراجعة');

          if (hasCountReference && !fabricationResult.containsFabrication) {
            breakdown.dataUsageReward += 0.3;
            score += 0.3;
          } else if (!hasCountReference) {
            issues.push(`AI failed to incorporate available review count (${reviewCount})`);
            suggestions.push(`Must mention the ${reviewCount} reviews found in database`);
          }
        }

        // Check average score usage
        if (avgScore && avgScore > 0) {
          const hasScoreReference = content.includes(avgScore.toFixed(1)) || 
                                   content.includes('score') || 
                                   content.includes('rating') ||
                                   content.includes('نقاط') ||
                                   content.includes('تقييم');

          if (hasScoreReference && !fabricationResult.containsFabrication) {
            breakdown.dataUsageReward += 0.2;
            score += 0.2;
          } else if (!hasScoreReference) {
            issues.push(`AI failed to incorporate available average score (${avgScore.toFixed(1)})`);
            suggestions.push(`Must mention the average score of ${avgScore.toFixed(1)}`);
          }
        }
      }
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      breakdown,
      issues,
      suggestions
    };
  }

  static checkDataAvailabilityAlignment(userMessage: string, availableData: any): {
    alignment: 'GOOD' | 'PARTIAL' | 'POOR';
    missingDataTypes: string[];
    availableDataTypes: string[];
  } {
    const messageLower = userMessage.toLowerCase();
    const missingDataTypes: string[] = [];
    const availableDataTypes: string[] = [];

    // Check what user is asking for
    const asksForOperational = /occupancy|revenue|adr|booking|financial|profit|cost/.test(messageLower);
    const asksForReviews = /review|feedback|guest|rating|satisfaction/.test(messageLower);

    // Check what we have available
    const hasReviews = availableData?.reviews?.length > 0 || availableData?.analytics?.totalReviews > 0;

    if (hasReviews) {
      availableDataTypes.push('reviews');
    }

    if (asksForOperational) {
      missingDataTypes.push('operational_data');
    }

    // Determine alignment
    let alignment: 'GOOD' | 'PARTIAL' | 'POOR';
    if (asksForReviews && hasReviews) {
      alignment = 'GOOD';
    } else if (asksForOperational && !hasReviews) {
      alignment = 'POOR';
    } else {
      alignment = 'PARTIAL';
    }

    return {
      alignment,
      missingDataTypes,
      availableDataTypes
    };
  }
}