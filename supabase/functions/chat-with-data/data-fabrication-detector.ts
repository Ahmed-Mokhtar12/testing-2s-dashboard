// Data Fabrication Detector - Detects AI-generated false operational data
export class DataFabricationDetector {
  
  // Patterns that indicate fabricated operational data
  private static readonly FABRICATION_INDICATORS = [
    /occupancy.{0,20}\d+%/i,
    /adr.{0,20}\$?\d+/i,
    /revenue.{0,20}\$?\d+/i,
    /\d+%.*occupancy/i,
    /average daily rate.{0,20}\d+/i,
    /revpar.{0,20}\d+/i,
    /booking.*\d+/i,
    /\$\d+.*revenue/i,
    /\d+.*rooms.*occupied/i,
    /booking rate.{0,20}\d+/i
  ];

  // Phrases that indicate honesty about data limitations
  private static readonly HONESTY_INDICATORS = [
    'لا أملك',
    'غير متوفر', 
    'أحتاج بيانات',
    'don\'t have',
    'not available',
    'need data',
    'لا توجد بيانات',
    'missing data',
    'ليس لدي'
  ];

  static detectFabrication(content: string): {
    containsFabrication: boolean;
    isHonestAboutLimitations: boolean;
    fabricationScore: number;
    detectedPatterns: string[];
  } {
    const detectedPatterns: string[] = [];
    
    // Check for fabrication patterns
    const containsFabrication = this.FABRICATION_INDICATORS.some(pattern => {
      const match = content.match(pattern);
      if (match) {
        detectedPatterns.push(match[0]);
        return true;
      }
      return false;
    });

    // Check for honesty indicators
    const isHonestAboutLimitations = this.HONESTY_INDICATORS.some(phrase => 
      content.toLowerCase().includes(phrase.toLowerCase())
    );

    // Calculate fabrication score
    let fabricationScore = 0.5; // Base score

    if (containsFabrication) {
      fabricationScore = 0.0; // Severe penalty for fabrication
    } else if (isHonestAboutLimitations) {
      fabricationScore = 1.0; // Reward honesty
    }

    return {
      containsFabrication,
      isHonestAboutLimitations,
      fabricationScore,
      detectedPatterns
    };
  }

  static generateFabricationIssues(fabricationResult: any): {
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (fabricationResult.containsFabrication) {
      issues.push('CRITICAL: AI fabricated operational data that does not exist in database');
      issues.push(`Detected fabricated patterns: ${fabricationResult.detectedPatterns.join(', ')}`);
      suggestions.push('AI must request missing data instead of fabricating it');
      suggestions.push('Use only verified data from available database records');
    }

    if (!fabricationResult.isHonestAboutLimitations && fabricationResult.containsFabrication) {
      suggestions.push('AI should clearly state data limitations when operational metrics are not available');
    }

    return { issues, suggestions };
  }
}