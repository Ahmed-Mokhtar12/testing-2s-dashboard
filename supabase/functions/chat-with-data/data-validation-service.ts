// Data Validation Service for Hotel Review Score Integrity
// Validates and reports on scoring inconsistencies across platforms

import { ScoreNormalizationUtils } from './score-normalization-utils.ts';

export interface ValidationReport {
  totalReviews: number;
  validReviews: number;
  invalidReviews: number;
  platformIssues: Record<string, {
    count: number;
    issues: string[];
    avgScore: number;
    suspiciousScores: number[];
  }>;
  recommendations: string[];
}

export class DataValidationService {
  /**
   * Comprehensive validation of review scores across all platforms
   */
  static validateReviewDatabase(reviews: any[]): ValidationReport {
    console.log('🔍 Starting comprehensive review database validation...');
    
    const report: ValidationReport = {
      totalReviews: reviews.length,
      validReviews: 0,
      invalidReviews: 0,
      platformIssues: {},
      recommendations: []
    };

    const platformData: Record<string, {
      scores: number[];
      issues: string[];
      validationResults: any[];
    }> = {};

    // Analyze each review
    reviews.forEach((review, index) => {
      const platform = review.Source || 'Unknown';
      const score = review.Score;

      if (!platformData[platform]) {
        platformData[platform] = {
          scores: [],
          issues: [],
          validationResults: []
        };
      }

      if (!score || typeof score !== 'number') {
        platformData[platform].issues.push(`Review ${index + 1}: Missing or invalid score`);
        report.invalidReviews++;
        return;
      }

      // Validate score using normalization utils
      const validation = ScoreNormalizationUtils.validateScoreIntegrity(score, platform);
      platformData[platform].validationResults.push(validation);
      platformData[platform].scores.push(score);

      if (validation.isValid) {
        report.validReviews++;
      } else {
        report.invalidReviews++;
        platformData[platform].issues.push(
          `Review ${index + 1}: ${validation.suggestion || 'Invalid score range'}`
        );
      }

      // Additional validation for suspicious patterns
      this.detectSuspiciousPatterns(score, platform, platformData[platform]);
    });

    // Generate platform-specific reports
    Object.entries(platformData).forEach(([platform, data]) => {
      const avgScore = data.scores.length > 0 
        ? data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length 
        : 0;

      const suspiciousScores = this.findSuspiciousScores(data.scores, platform);

      report.platformIssues[platform] = {
        count: data.scores.length,
        issues: data.issues,
        avgScore: Math.round(avgScore * 100) / 100,
        suspiciousScores
      };
    });

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);

    console.log('✅ Validation complete:', {
      totalReviews: report.totalReviews,
      validReviews: report.validReviews,
      invalidReviews: report.invalidReviews,
      platformsAnalyzed: Object.keys(report.platformIssues).length
    });

    return report;
  }

  /**
   * Detect suspicious scoring patterns that might indicate data issues
   */
  private static detectSuspiciousPatterns(score: number, platform: string, platformData: any): void {
    // Check for Booking.com specific issues (10-point scores stored as 5-point)
    if (platform === 'Booking.com' && score > 5) {
      platformData.issues.push(
        `Suspicious: Booking.com score ${score} > 5 (should be normalized to 5-point scale)`
      );
    }

    // Check for impossible perfect scores on 10-point platforms
    if (['Agoda', 'Hotels.com'].includes(platform) && score === 10) {
      platformData.issues.push(
        `Warning: Perfect 10/10 score on ${platform} (verify authenticity)`
      );
    }

    // Check for very low scores that might indicate scale confusion
    if (score < 1 && platform !== 'Unknown') {
      platformData.issues.push(
        `Warning: Very low score ${score} on ${platform} (verify scale)`
      );
    }
  }

  /**
   * Find scores that seem statistically suspicious
   */
  private static findSuspiciousScores(scores: number[], platform: string): number[] {
    if (scores.length < 10) return []; // Need sufficient data

    const sortedScores = [...scores].sort((a, b) => a - b);
    const q1 = sortedScores[Math.floor(scores.length * 0.25)];
    const q3 = sortedScores[Math.floor(scores.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return scores.filter(score => score < lowerBound || score > upperBound);
  }

  /**
   * Generate actionable recommendations based on validation results
   */
  private static generateRecommendations(report: ValidationReport): string[] {
    const recommendations: string[] = [];

    // Overall data quality
    const qualityPercentage = (report.validReviews / report.totalReviews) * 100;
    if (qualityPercentage < 95) {
      recommendations.push(
        `Data quality is ${qualityPercentage.toFixed(1)}% - investigate ${report.invalidReviews} invalid reviews`
      );
    }

    // Platform-specific recommendations
    Object.entries(report.platformIssues).forEach(([platform, data]) => {
      if (data.issues.length > 0) {
        recommendations.push(
          `${platform}: ${data.issues.length} issues detected - review scoring scale consistency`
        );
      }

      // Check for Booking.com specific issues
      if (platform === 'Booking.com' && data.avgScore > 5) {
        recommendations.push(
          `Booking.com: Average score ${data.avgScore} suggests 10-point scores not properly normalized`
        );
      }

      // Check for suspiciously high averages on 5-point scales
      if (['Google', 'TripAdvisor', 'Expedia'].includes(platform) && data.avgScore > 4.5) {
        recommendations.push(
          `${platform}: Very high average ${data.avgScore}/5 - verify score authenticity`
        );
      }

      // Check for suspiciously low averages
      if (data.avgScore < 2.0 && data.count > 10) {
        recommendations.push(
          `${platform}: Very low average ${data.avgScore} - investigate data collection issues`
        );
      }
    });

    // Add general recommendations
    if (recommendations.length === 0) {
      recommendations.push('Data validation passed - all scores appear consistent and properly normalized');
    } else {
      recommendations.push(
        'Implement regular data validation checks to catch scoring inconsistencies early'
      );
      recommendations.push(
        'Consider adding data source tracking to maintain scoring scale documentation'
      );
    }

    return recommendations;
  }

  /**
   * Generate a formatted validation report for AI context
   */
  static formatValidationReportForAI(report: ValidationReport): string {
    let context = `🔍 DATA VALIDATION REPORT:\n`;
    context += `📊 Total Reviews: ${report.totalReviews}\n`;
    context += `✅ Valid Reviews: ${report.validReviews}\n`;
    context += `❌ Invalid Reviews: ${report.invalidReviews}\n`;
    context += `📈 Data Quality: ${((report.validReviews / report.totalReviews) * 100).toFixed(1)}%\n\n`;

    context += `🏢 PLATFORM-SPECIFIC VALIDATION:\n`;
    Object.entries(report.platformIssues).forEach(([platform, data]) => {
      context += `   • ${platform}: ${data.count} reviews, avg: ${data.avgScore}\n`;
      if (data.issues.length > 0) {
        context += `     Issues: ${data.issues.length} found\n`;
        data.issues.slice(0, 3).forEach(issue => {
          context += `     - ${issue}\n`;
        });
      }
      if (data.suspiciousScores.length > 0) {
        context += `     Suspicious scores: ${data.suspiciousScores.slice(0, 5).join(', ')}\n`;
      }
    });

    context += `\n💡 RECOMMENDATIONS:\n`;
    report.recommendations.forEach(rec => {
      context += `   • ${rec}\n`;
    });

    context += `\n🚨 CRITICAL: Always use normalized scoring when comparing across platforms!\n`;

    return context;
  }
}