import { SmartQueryAnalysis } from './types.ts';

export function analyzeQueryIntelligently(message: string): SmartQueryAnalysis {
  const lowerMessage = message.toLowerCase();
  
  // Specific month patterns (June 2025, May 2024, etc.)
  const monthPattern = /(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(\d{4})/i;
  const monthMatch = lowerMessage.match(monthPattern);
  
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const year = monthMatch[2];
    const monthNumbers: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };
    
    return {
      type: 'specific_month',
      month: monthName,
      year,
      startDate: `${year}-${monthNumbers[monthName]}-01`,
      endDate: `${year}-${monthNumbers[monthName]}-31`,
      description: `${monthName} ${year}`
    };
  }
  
  // Recent period patterns (past X days, last X weeks, etc.)
  const pastDaysPattern = /(?:past|last)\s*(\d+)\s*days?/i;
  const pastWeeksPattern = /(?:past|last)\s*(\d+)\s*weeks?/i;
  const pastMonthsPattern = /(?:past|last)\s*(\d+)\s*months?/i;
  
  const daysMatch = lowerMessage.match(pastDaysPattern);
  const weeksMatch = lowerMessage.match(pastWeeksPattern);
  const monthsMatch = lowerMessage.match(pastMonthsPattern);
  
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return {
      type: 'recent_period',
      days,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: `past ${days} days`
    };
  }
  
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1]);
    const days = weeks * 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return {
      type: 'recent_period',
      days,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: `past ${weeks} weeks`
    };
  }
  
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1]);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    return {
      type: 'recent_period',
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: `past ${months} months`
    };
  }
  
  // Recent/current patterns
  if (lowerMessage.includes('recent') || lowerMessage.includes('lately') || lowerMessage.includes('this month')) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return {
      type: 'recent_period',
      days: 30,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: 'recent period (30 days)'
    };
  }
  
  if (lowerMessage.includes('this year')) {
    const year = new Date().getFullYear();
    return {
      type: 'date_range',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      description: `this year (${year})`
    };
  }
  
  if (lowerMessage.includes('last year')) {
    const year = new Date().getFullYear() - 1;
    return {
      type: 'date_range',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      description: `last year (${year})`
    };
  }
  
  // Analytics patterns
  if (lowerMessage.includes('breakdown') || lowerMessage.includes('analysis') || 
      lowerMessage.includes('average') || lowerMessage.includes('source') ||
      lowerMessage.includes('rating') || lowerMessage.includes('score')) {
    return {
      type: 'analytics',
      description: 'analytics query'
    };
  }
  
  return { type: 'general', description: 'general query' };
}