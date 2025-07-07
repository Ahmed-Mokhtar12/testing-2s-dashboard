export interface ConversationData {
  recentDataPoints: Map<string, any>;
  conversationFlow: string;
  userPreferences: {
    detailLevel: 'low' | 'moderate' | 'high';
    communicationStyle: 'professional' | 'friendly' | 'casual';
    focusAreas: string[];
  };
  conversationContext: string;
}

export class ConversationContextAnalyzer {
  static analyzeConversationHistory(userHistory?: any[]): ConversationData {
    console.log('🔍 Analyzing conversation context and extracting data points...');
    
    let recentDataPoints = new Map<string, any>();
    let conversationFlow = '';
    let userPreferences = {
      detailLevel: 'moderate' as const,
      communicationStyle: 'professional' as const,
      focusAreas: ['general']
    };
    let conversationContext = '';

    if (userHistory && userHistory.length > 0) {
      const recentMessages = userHistory.slice(-10);
      
      // Extract recent data points and metrics mentioned
      recentMessages.forEach(msg => {
        if (msg.message) {
          const message = msg.message.toLowerCase();
          
          // Extract numerical data mentioned (scores, ratings, percentages)
          const scoreMatches = message.match(/(\d+\.?\d*)\s*(score|rating|average|avg|rate)/g);
          if (scoreMatches) {
            scoreMatches.forEach(match => {
              const value = match.match(/(\d+\.?\d*)/)?.[1];
              if (value) {
                recentDataPoints.set('recent_score', value);
                recentDataPoints.set('score_context', match);
              }
            });
          }
          
          // Extract time periods mentioned
          const timeMatches = message.match(/(january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|last month|this month|recent|latest)/g);
          if (timeMatches) {
            recentDataPoints.set('time_period', timeMatches[timeMatches.length - 1]);
          }
          
          // Extract topics of interest
          const topicKeywords = ['reviews', 'staff', 'service', 'operations', 'guest', 'revenue', 'training', 'satisfaction', 'complaints'];
          topicKeywords.forEach(keyword => {
            if (message.includes(keyword)) {
              const current = recentDataPoints.get('topics') || [];
              if (!current.includes(keyword)) {
                current.push(keyword);
                recentDataPoints.set('topics', current);
              }
            }
          });
        }
      });
      
      // Detect communication style preferences
      const hasDetailRequests = recentMessages.some(msg => 
        msg.message?.toLowerCase().includes('detail') || 
        msg.message?.toLowerCase().includes('specific') ||
        msg.message?.toLowerCase().includes('analyze')
      );
      
      const hasCasualTone = recentMessages.some(msg =>
        msg.message?.toLowerCase().includes('thanks') ||
        msg.message?.toLowerCase().includes('great') ||
        msg.message?.length < 50
      );

      if (hasDetailRequests) userPreferences.detailLevel = 'high';
      if (hasCasualTone) userPreferences.communicationStyle = 'friendly';

      // Create conversation flow context
      if (recentDataPoints.size > 0) {
        conversationFlow = '\n🧠 RECENT CONVERSATION CONTEXT:\n';
        
        if (recentDataPoints.has('recent_score')) {
          conversationFlow += `- Recently discussed score/rating: ${recentDataPoints.get('recent_score')} (${recentDataPoints.get('score_context')})\n`;
        }
        
        if (recentDataPoints.has('time_period')) {
          conversationFlow += `- Time period in focus: ${recentDataPoints.get('time_period')}\n`;
        }
        
        if (recentDataPoints.has('topics')) {
          conversationFlow += `- Topics discussed: ${recentDataPoints.get('topics').join(', ')}\n`;
        }
        
        conversationFlow += '- CRITICAL: Reference these data points when user asks follow-up questions. DO NOT ask for clarification on recently mentioned metrics.\n';
      }

      // Extract focus areas from recent conversations
      const focusKeywords = ['reviews', 'staff', 'service', 'operations', 'guest', 'revenue', 'training'];
      userPreferences.focusAreas = focusKeywords.filter(keyword =>
        recentMessages.some(msg => msg.message?.toLowerCase().includes(keyword))
      );

      conversationContext = `Previous conversation context: We've been discussing ${userPreferences.focusAreas.join(', ')} with a ${userPreferences.communicationStyle} approach.`;
    }

    console.log('✅ Conversation context analysis completed');
    return {
      recentDataPoints,
      conversationFlow,
      userPreferences,
      conversationContext
    };
  }
}