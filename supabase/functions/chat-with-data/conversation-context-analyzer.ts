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
      
      // Enhanced data point extraction with conversation memory
      recentMessages.forEach((msg, index) => {
        if (msg.message) {
          const message = msg.message.toLowerCase();
          const isRecent = index < 5; // Last 5 messages are most recent
          
          // Extract numerical data mentioned (scores, ratings, percentages)
          const scoreMatches = message.match(/(\d+\.?\d*)\s*(score|rating|average|avg|rate|\/5|out of)/g);
          if (scoreMatches) {
            scoreMatches.forEach(match => {
              const value = match.match(/(\d+\.?\d*)/)?.[1];
              if (value) {
                const key = isRecent ? 'recent_score' : 'historical_score';
                recentDataPoints.set(key, parseFloat(value));
                recentDataPoints.set('score_context', match);
                recentDataPoints.set('score_message_index', index);
              }
            });
          }
          
          // Extract specific numbers mentioned (review counts, percentages, etc.)
          const numberMatches = message.match(/(\d+)\s*(reviews?|guests?|complaints?|bookings?|rooms?|%|percent)/g);
          if (numberMatches) {
            numberMatches.forEach(match => {
              const parts = match.match(/(\d+)\s*(.+)/);
              if (parts) {
                recentDataPoints.set(`number_${parts[2]}`, parseInt(parts[1]));
              }
            });
          }
          
          // Extract time periods mentioned with better specificity
          const timeMatches = message.match(/(january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|last month|this month|recent|latest|yesterday|today|week|quarter)/g);
          if (timeMatches) {
            recentDataPoints.set('time_period', timeMatches[timeMatches.length - 1]);
            recentDataPoints.set('time_context', `mentioned in message ${index + 1}`);
          }
          
          // Extract specific hotel areas/topics with context
          const hotelAreas = {
            'rooms': ['room', 'suite', 'accommodation', 'bed', 'bathroom'],
            'dining': ['restaurant', 'food', 'breakfast', 'dinner', 'menu', 'dining'],
            'facilities': ['pool', 'gym', 'spa', 'fitness', 'facility', 'amenity'],
            'service': ['staff', 'service', 'reception', 'concierge', 'housekeeping'],
            'booking': ['booking', 'reservation', 'price', 'rate', 'availability'],
            'reviews': ['review', 'rating', 'feedback', 'comment', 'satisfaction'],
            'operations': ['operation', 'management', 'training', 'policy']
          };
          
          Object.entries(hotelAreas).forEach(([area, keywords]) => {
            if (keywords.some(keyword => message.includes(keyword))) {
              const current = recentDataPoints.get('focus_areas') || [];
              if (!current.includes(area)) {
                current.push(area);
                recentDataPoints.set('focus_areas', current);
              }
            }
          });
          
          // Extract specific guest concerns or positive mentions
          const sentimentKeywords = {
            'concerns': ['problem', 'issue', 'complaint', 'bad', 'poor', 'terrible', 'awful'],
            'positives': ['excellent', 'great', 'amazing', 'wonderful', 'perfect', 'outstanding']
          };
          
          Object.entries(sentimentKeywords).forEach(([sentiment, keywords]) => {
            if (keywords.some(keyword => message.includes(keyword))) {
              const current = recentDataPoints.get(`recent_${sentiment}`) || [];
              current.push(`message ${index + 1}`);
              recentDataPoints.set(`recent_${sentiment}`, current);
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

      // Create enhanced conversation flow context
      if (recentDataPoints.size > 0) {
        conversationFlow = '\n🧠 CONVERSATION MEMORY (Recent Context):\n';
        
        if (recentDataPoints.has('recent_score')) {
          conversationFlow += `- Score mentioned: ${recentDataPoints.get('recent_score')} (context: ${recentDataPoints.get('score_context')})\n`;
        }
        
        if (recentDataPoints.has('time_period')) {
          conversationFlow += `- Time focus: ${recentDataPoints.get('time_period')} ${recentDataPoints.has('time_context') ? `(${recentDataPoints.get('time_context')})` : ''}\n`;
        }
        
        if (recentDataPoints.has('focus_areas')) {
          conversationFlow += `- Hotel areas discussed: ${recentDataPoints.get('focus_areas').join(', ')}\n`;
        }
        
        // Add number references
        for (const [key, value] of recentDataPoints.entries()) {
          if (key.startsWith('number_')) {
            const type = key.replace('number_', '');
            conversationFlow += `- ${type}: ${value}\n`;
          }
        }
        
        if (recentDataPoints.has('recent_concerns')) {
          conversationFlow += `- Recent concerns noted in: ${recentDataPoints.get('recent_concerns').join(', ')}\n`;
        }
        
        if (recentDataPoints.has('recent_positives')) {
          conversationFlow += `- Positive feedback in: ${recentDataPoints.get('recent_positives').join(', ')}\n`;
        }
        
        conversationFlow += '\n⚡ CRITICAL MEMORY RULES:\n';
        conversationFlow += '- NEVER ask for clarification on metrics just mentioned\n';
        conversationFlow += '- Reference specific numbers and contexts from above\n';
        conversationFlow += '- Build naturally on recent discussion points\n';
        conversationFlow += '- Continue conversation as if no time has passed\n';
      }

      // Extract focus areas from recent conversations with priority
      const focusAreas = recentDataPoints.get('focus_areas') || [];
      userPreferences.focusAreas = focusAreas.length > 0 ? focusAreas : ['general'];

      // Build contextual conversation summary
      const contextElements = [];
      if (focusAreas.length > 0) {
        contextElements.push(`discussing ${focusAreas.join(', ')}`);
      }
      if (recentDataPoints.has('recent_score')) {
        contextElements.push(`reviewing scores around ${recentDataPoints.get('recent_score')}`);
      }
      if (recentDataPoints.has('time_period')) {
        contextElements.push(`focusing on ${recentDataPoints.get('time_period')} data`);
      }
      
      conversationContext = contextElements.length > 0 
        ? `Recent conversation: ${contextElements.join(', ')} with ${userPreferences.communicationStyle} communication style.`
        : `Starting fresh conversation with ${userPreferences.communicationStyle} approach.`;
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