// Score Normalization Utilities for Cross-Platform Review Analysis
// Handles different scoring scales from various review platforms

export interface ScoreNormalizationData {
  originalScore: number;
  normalizedScore: number;
  platform: string;
  originalScale: string;
  normalizedScale: string;
}

export class ScoreNormalizationUtils {
  // Platform-specific scoring scale mapping
  private static readonly PLATFORM_SCALES = {
    'Booking.com': { max: 10, displayMax: 5, alreadyNormalized: true },
    'Agoda': { max: 10, displayMax: 5, alreadyNormalized: false },
    'Google': { max: 5, displayMax: 5, alreadyNormalized: true },
    'TripAdvisor': { max: 5, displayMax: 5, alreadyNormalized: true },
    'Expedia': { max: 5, displayMax: 5, alreadyNormalized: true },
    'Hotels.com': { max: 10, displayMax: 5, alreadyNormalized: false },
    'Kayak': { max: 10, displayMax: 5, alreadyNormalized: false },
    'Trivago': { max: 10, displayMax: 5, alreadyNormalized: false }
  };

  /**
   * Normalize a score to the standard 5-point scale
   */
  static normalizeScore(score: number, platform: string): ScoreNormalizationData {
    const platformData = this.PLATFORM_SCALES[platform as keyof typeof this.PLATFORM_SCALES];
    
    if (!platformData) {
      console.warn(`⚠️ Unknown platform: ${platform}, treating as 5-point scale`);
      return {
        originalScore: score,
        normalizedScore: score,
        platform,
        originalScale: '5-point (assumed)',
        normalizedScale: '5-point'
      };
    }

    let normalizedScore: number;
    let originalScale: string;

    if (platformData.alreadyNormalized) {
      // Score is already in 5-point scale or correctly converted
      normalizedScore = score;
      originalScale = `${platformData.max}-point (stored as 5-point)`;
    } else {
      // Convert from original scale to 5-point scale
      normalizedScore = (score / platformData.max) * 5;
      originalScale = `${platformData.max}-point`;
    }

    return {
      originalScore: score,
      normalizedScore: Math.round(normalizedScore * 10) / 10, // Round to 1 decimal
      platform,
      originalScale,
      normalizedScale: '5-point'
    };
  }

  /**
   * Get the original score display for user interface
   */
  static getOriginalScoreDisplay(score: number, platform: string): string {
    const platformData = this.PLATFORM_SCALES[platform as keyof typeof this.PLATFORM_SCALES];
    
    if (!platformData) {
      return `${score}/5`;
    }

    if (platformData.alreadyNormalized && platformData.max === 10) {
      // For Booking.com: stored as 5-point but originally 10-point
      const originalScore = (score / 5) * 10;
      return `${originalScore.toFixed(1)}/10 (Booking.com original)`;
    }

    return `${score}/${platformData.displayMax}`;
  }

  /**
   * Calculate accurate average considering different scales
   */
  static calculateNormalizedAverage(reviews: any[]): {
    normalizedAverage: number;
    totalReviews: number;
    platformBreakdown: Record<string, { count: number; avgNormalized: number; avgOriginal: number }>;
  } {
    const validReviews = reviews.filter(r => r.Score && r.Source);
    
    if (validReviews.length === 0) {
      return {
        normalizedAverage: 0,
        totalReviews: 0,
        platformBreakdown: {}
      };
    }

    const platformBreakdown: Record<string, { scores: number[]; originalScores: number[] }> = {};
    let totalNormalizedScore = 0;

    validReviews.forEach(review => {
      const platform = review.Source || 'Unknown';
      const normalizationData = this.normalizeScore(review.Score, platform);
      
      if (!platformBreakdown[platform]) {
        platformBreakdown[platform] = { scores: [], originalScores: [] };
      }
      
      platformBreakdown[platform].scores.push(normalizationData.normalizedScore);
      platformBreakdown[platform].originalScores.push(review.Score);
      totalNormalizedScore += normalizationData.normalizedScore;
    });

    // Calculate platform averages
    const finalBreakdown: Record<string, { count: number; avgNormalized: number; avgOriginal: number }> = {};
    
    Object.entries(platformBreakdown).forEach(([platform, data]) => {
      finalBreakdown[platform] = {
        count: data.scores.length,
        avgNormalized: data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length,
        avgOriginal: data.originalScores.reduce((sum, score) => sum + score, 0) / data.originalScores.length
      };
    });

    return {
      normalizedAverage: Math.round((totalNormalizedScore / validReviews.length) * 10) / 10,
      totalReviews: validReviews.length,
      platformBreakdown: finalBreakdown
    };
  }

  /**
   * Generate scoring context for AI responses
   */
  static generateScoringContext(reviews: any[]): string {
    const { normalizedAverage, totalReviews, platformBreakdown } = this.calculateNormalizedAverage(reviews);
    
    let context = `🎯 IMPORTANT SCORING INFORMATION:\n`;
    context += `📊 All scores are normalized to 5-point scale for accurate comparison\n`;
    context += `⭐ Overall Normalized Average: ${normalizedAverage}/5 (based on ${totalReviews} reviews)\n\n`;
    
    context += `📋 PLATFORM-SPECIFIC BREAKDOWN:\n`;
    
    Object.entries(platformBreakdown).forEach(([platform, data]) => {
      const platformData = this.PLATFORM_SCALES[platform as keyof typeof this.PLATFORM_SCALES];
      const originalScale = platformData ? `${platformData.max}-point` : '5-point';
      
      context += `   • ${platform}: ${data.count} reviews\n`;
      context += `     - Normalized Average: ${data.avgNormalized.toFixed(1)}/5\n`;
      context += `     - Original Average: ${data.avgOriginal.toFixed(1)}/${originalScale === '10-point' ? '10' : '5'} (${originalScale} scale)\n`;
    });
    
    context += `\n🚨 CRITICAL: When discussing scores, always mention:\n`;
    context += `   1. The normalized score (out of 5) for comparison\n`;
    context += `   2. The original platform score when relevant\n`;
    context += `   3. That Booking.com scores are stored as 5-point but originally 10-point\n`;
    context += `   4. Cross-platform comparisons use normalized scores\n\n`;
    
    return context;
  }

  /**
   * Validate if a score needs correction based on platform
   */
  static validateScoreIntegrity(score: number, platform: string): {
    isValid: boolean;
    expectedRange: string;
    suggestion?: string;
  } {
    const platformData = this.PLATFORM_SCALES[platform as keyof typeof this.PLATFORM_SCALES];
    
    if (!platformData) {
      return {
        isValid: true,
        expectedRange: '0-5 (assumed)',
        suggestion: `Unknown platform ${platform}, assuming 5-point scale`
      };
    }

    const maxExpected = platformData.alreadyNormalized ? 5 : platformData.max;
    const isValid = score >= 0 && score <= maxExpected;
    
    if (!isValid) {
      return {
        isValid: false,
        expectedRange: `0-${maxExpected}`,
        suggestion: `Score ${score} is outside expected range for ${platform}`
      };
    }

    return {
      isValid: true,
      expectedRange: `0-${maxExpected}`
    };
  }
}