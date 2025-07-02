export interface QueryAnalysis {
  type: 'monthly_data' | 'review_summary' | 'general' | 'recent_activity' | 'training' | 'documents';
  specificMonth?: string;
  specificYear?: string;
  timeframe?: 'recent' | 'historical' | 'specific';
  keywords: string[];
  confidence: number;
}

export class QueryAnalyzer {
  static analyzeQuery(message: string): QueryAnalysis {
    const lowerMessage = message.toLowerCase();
    const keywords = this.extractKeywords(lowerMessage);
    
    // Check for specific month/year patterns
    const monthYearMatch = this.extractMonthYear(lowerMessage);
    
    // Determine query type based on patterns
    if (monthYearMatch || this.isMonthlyDataQuery(lowerMessage)) {
      return {
        type: 'monthly_data',
        specificMonth: monthYearMatch?.month,
        specificYear: monthYearMatch?.year,
        timeframe: monthYearMatch ? 'specific' : 'general',
        keywords,
        confidence: monthYearMatch ? 0.95 : 0.8
      };
    }
    
    if (this.isRecentActivityQuery(lowerMessage)) {
      return {
        type: 'recent_activity',
        timeframe: 'recent',
        keywords,
        confidence: 0.9
      };
    }
    
    if (this.isReviewSummaryQuery(lowerMessage)) {
      return {
        type: 'review_summary',
        timeframe: 'general',
        keywords,
        confidence: 0.8
      };
    }
    
    if (this.isTrainingQuery(lowerMessage)) {
      return {
        type: 'training',
        timeframe: 'general',
        keywords,
        confidence: 0.8
      };
    }
    
    if (this.isDocumentQuery(lowerMessage)) {
      return {
        type: 'documents',
        timeframe: 'recent',
        keywords,
        confidence: 0.8
      };
    }
    
    return {
      type: 'general',
      timeframe: 'general',
      keywords,
      confidence: 0.6
    };
  }
  
  private static extractMonthYear(message: string): { month: string; year: string } | null {
    // Pattern for "June 2025", "june 2025", etc.
    const monthYearPattern = /(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})/i;
    const match = message.match(monthYearPattern);
    
    if (match) {
      const monthName = match[1].toLowerCase();
      const year = match[2];
      const monthNumber = this.getMonthNumber(monthName);
      return { month: monthNumber, year };
    }
    
    // Pattern for "2025-06", "06/2025", etc.
    const numericPattern = /(\d{4})[-\/](\d{1,2})|(\d{1,2})[-\/](\d{4})/;
    const numericMatch = message.match(numericPattern);
    
    if (numericMatch) {
      if (numericMatch[1] && numericMatch[2]) {
        // YYYY-MM format
        return { month: numericMatch[2].padStart(2, '0'), year: numericMatch[1] };
      } else if (numericMatch[3] && numericMatch[4]) {
        // MM/YYYY format
        return { month: numericMatch[3].padStart(2, '0'), year: numericMatch[4] };
      }
    }
    
    return null;
  }
  
  private static getMonthNumber(monthName: string): string {
    const months: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };
    return months[monthName.toLowerCase()] || '01';
  }
  
  private static isMonthlyDataQuery(message: string): boolean {
    const monthlyKeywords = ['reviews in', 'reviews for', 'monthly', 'month', 'breakdown', 'reviews by month'];
    return monthlyKeywords.some(keyword => message.includes(keyword));
  }
  
  private static isRecentActivityQuery(message: string): boolean {
    const recentKeywords = ['recent', 'latest', 'last 30 days', 'past month', 'this month'];
    return recentKeywords.some(keyword => message.includes(keyword));
  }
  
  private static isReviewSummaryQuery(message: string): boolean {
    const reviewKeywords = ['reviews', 'feedback', 'ratings', 'scores', 'guest', 'customer'];
    return reviewKeywords.some(keyword => message.includes(keyword));
  }
  
  private static isTrainingQuery(message: string): boolean {
    const trainingKeywords = ['training', 'staff', 'education', 'learning'];
    return trainingKeywords.some(keyword => message.includes(keyword));
  }
  
  private static isDocumentQuery(message: string): boolean {
    const documentKeywords = ['document', 'file', 'upload', 'pdf'];
    return documentKeywords.some(keyword => message.includes(keyword));
  }
  
  private static extractKeywords(message: string): string[] {
    // Extract meaningful keywords for context relevance
    const words = message.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'how', 'what', 'when', 'where', 'why', 'can', 'could', 'would', 'should']);
    
    return words.filter(word => 
      word.length > 2 && 
      !stopWords.has(word) && 
      /^[a-zA-Z0-9]+$/.test(word)
    );
  }
}