// Data Fabrication Detector - Detects AI-generated false operational data
//
// Scoped to metrics that are genuinely unavailable in the connected tables
// (occupancy, ADR, RevPAR, revenue). Earlier versions matched any sentence
// containing the word "booking" near a digit, which misfired on ordinary
// business wording (e.g. "51 WhatsApp messages about bookings",
// "Booking.com reviews: 12") — that broad pattern has been removed.
const METRIC_PATTERNS: Array<[string, RegExp]> = [
  ['occupancy', /\boccupancy\b[^.\n]{0,30}?\d+(\.\d+)?\s*%/i],
  ['adr', /\badr\b[^.\n]{0,30}?(aed\s*)?\d/i],
  ['revpar', /\brevpar\b[^.\n]{0,30}?(aed\s*)?\d/i],
  ['revenue', /\brevenue\b[^.\n]{0,30}?(aed|\$|usd)\s*\d/i],
];

// Pure function, deliberately kept dependency-free (no Deno imports in this
// module) so it can be imported directly by Node-based unit tests.
export function detectFabricatedMetrics(text: string): string[] {
  return METRIC_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export class DataFabricationDetector {

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

  // Thin wrapper over `detectFabricatedMetrics` — kept so `DataUtilizationScorer`
  // and `generateFabricationIssues` below keep compiling against the same
  // return shape (containsFabrication / isHonestAboutLimitations /
  // fabricationScore / detectedPatterns).
  static detectFabrication(content: string): {
    containsFabrication: boolean;
    isHonestAboutLimitations: boolean;
    fabricationScore: number;
    detectedPatterns: string[];
  } {
    const detectedPatterns = detectFabricatedMetrics(content);
    const containsFabrication = detectedPatterns.length > 0;

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