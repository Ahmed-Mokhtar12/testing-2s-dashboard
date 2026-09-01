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
    
    const recentDataPoints = new Map<string, any>();
    let conversationFlow = '';
    const userPreferences = {
      detailLevel: 'moderate' as const,
      communicationStyle: 'professional' as const,
      focusAreas: ['general']
    };
    let conversationContext = '';

    if (userHistory && userHistory.length > 0) {
      // History is NEWEST FIRST (index.ts orders created_at desc, limit 30): take the head.
      // slice(-5) took the five OLDEST turns and called them recent (audit E8).
      const recentExchanges = userHistory.slice(0, 5);
      
      // Enhanced data point extraction with conversation memory from website_chats
      recentExchanges.forEach((exchange, index) => {
        // Process both user message and AI response for complete context
        const messagesToProcess = [];
        if (exchange.user_message) messagesToProcess.push(exchange.user_message);
        if (exchange.ai_response) messagesToProcess.push(exchange.ai_response);
        
        messagesToProcess.forEach(messageText => {
          const message = messageText.toLowerCase();
          const isRecent = index < 3; // Last 3 exchanges are most recent
          
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
        });
      });
      
      // Detect communication style preferences from website_chats structure
      const hasDetailRequests = recentExchanges.some(exchange => 
        exchange.user_message?.toLowerCase().includes('detail') || 
        exchange.user_message?.toLowerCase().includes('specific') ||
        exchange.user_message?.toLowerCase().includes('analyze') ||
        exchange.ai_response?.toLowerCase().includes('detailed analysis')
      );
      
      const hasCasualTone = recentExchanges.some(exchange =>
        exchange.user_message?.toLowerCase().includes('thanks') ||
        exchange.user_message?.toLowerCase().includes('great') ||
        (exchange.user_message?.length || 0) < 50
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
  
  // Enhanced intelligent tracking methods
  static enhanceDataPointTracking(recentDataPoints: Map<string, any>, chatHistory: any[]): void {
    console.log('🎯 Enhancing data point tracking with semantic analysis...');
    
    // Add semantic patterns and context relationships
    if (chatHistory && chatHistory.length > 0) {
      const allText = chatHistory.map(h => `${h.user_message || ''} ${h.ai_response || ''}`).join(' ').toLowerCase();
      
      // Detect data request patterns
      const dataRequestPatterns = [
        'past.*days?',
        'last.*month',
        'recent.*reviews?',
        'latest.*data',
        'current.*status',
        'الأيام الماضية',
        'الشهر الماضي',
        'المراجعات الأخيرة'
      ];
      
      dataRequestPatterns.forEach(pattern => {
        const regex = new RegExp(pattern, 'gi');
        const matches = allText.match(regex);
        if (matches) {
          recentDataPoints.set('data_request_type', matches[0]);
          recentDataPoints.set('expects_specific_data', true);
        }
      });
      
      // Track question complexity
      const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'ما', 'كيف', 'لماذا', 'متى', 'أين', 'أي'];
      const questionCount = questionWords.reduce((count, word) => {
        return count + (allText.match(new RegExp(word, 'gi')) || []).length;
      }, 0);
      
      if (questionCount > 2) {
        recentDataPoints.set('conversation_complexity', 'high');
      } else if (questionCount > 0) {
        recentDataPoints.set('conversation_complexity', 'moderate');
      }
    }
  }
  
  static addSemanticContextTracking(conversationContext: string, chatHistory: any[]): string {
    console.log('🧠 Adding semantic context tracking...');
    
    if (chatHistory && chatHistory.length > 0) {
      const recentMessages = chatHistory.slice(-3);
      
      // Detect conversation momentum
      const topics = new Set<string>();
      recentMessages.forEach(msg => {
        const text = `${msg.user_message || ''} ${msg.ai_response || ''}`.toLowerCase();
        
        // Extract key topics
        const keyTerms = text.match(/\b(review|score|rating|guest|service|room|food|staff|booking|price|facility|amenity)\w*\b/g);
        if (keyTerms) {
          keyTerms.forEach(term => topics.add(term));
        }
      });
      
      if (topics.size > 0) {
        conversationContext += ` Focus topics: ${Array.from(topics).join(', ')}.`;
      }
    }
    
    return conversationContext;
  }
  
  static generateSmartFollowUps(recentDataPoints: Map<string, any>, userMessage: string): string[] {
    const followUps: string[] = [];
    
    // Generate contextual follow-ups based on data points
    if (recentDataPoints.has('recent_score')) {
      const score = recentDataPoints.get('recent_score');
      if (score < 3) {
        followUps.push('هل تريد استراتيجية محددة لتحسين هذه التقييمات المنخفضة؟');
      } else if (score > 4) {
        followUps.push('هل تريد معرفة العوامل التي تجعل تجربة الضيوف متميزة؟');
      }
    }
    
    if (recentDataPoints.has('time_period')) {
      followUps.push('هل تريد مقارنة هذه النتائج مع فترات أخرى؟');
    }
    
    if (recentDataPoints.has('focus_areas')) {
      const areas = recentDataPoints.get('focus_areas');
      if (areas.includes('service')) {
        followUps.push('هل تحتاج توصيات محددة لتطوير الخدمة؟');
      }
      if (areas.includes('rooms')) {
        followUps.push('هل تريد تحليل تفصيلي لتجربة الغرف؟');
      }
    }
    
    // Add general intelligent follow-ups
    if (userMessage.toLowerCase().includes('data') || userMessage.includes('بيانات')) {
      followUps.push('هل تريد تحليلاً أعمق أو رؤى إضافية من البيانات؟');
    }
    
    return followUps;
  }
}