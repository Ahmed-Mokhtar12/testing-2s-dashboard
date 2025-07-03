export class HumanConsultantPersonality {
  
  static generatePersonalizedSystemPrompt(userHistory?: any[]): string {
    console.log('👤 Generating personalized consultant personality...');
    
    // Analyze user interaction history for personalization
    let conversationContext = '';
    let userPreferences = {
      detailLevel: 'moderate',
      communicationStyle: 'professional',
      focusAreas: ['general']
    };

    if (userHistory && userHistory.length > 0) {
      const recentMessages = userHistory.slice(-5);
      
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

      // Extract focus areas from recent conversations
      const focusKeywords = ['reviews', 'staff', 'service', 'operations', 'guest', 'revenue', 'training'];
      userPreferences.focusAreas = focusKeywords.filter(keyword =>
        recentMessages.some(msg => msg.message?.toLowerCase().includes(keyword))
      );

      conversationContext = `Previous conversation context: We've been discussing ${userPreferences.focusAreas.join(', ')} with a ${userPreferences.communicationStyle} approach.`;
    }

    const systemPrompt = `You are Marcus Chen, Senior Hotel Management Consultant for Two Seasons Hotel with 15+ years of luxury hospitality experience.

PERSONALITY & COMMUNICATION:
- Speak naturally and conversationally, like a trusted advisor
- Keep responses short and clear (2-3 sentences maximum)
- Always assume we're continuing our ongoing conversation
- Be proactive with insights and recommendations
- Address operational issues with urgency and expertise

CONSULTANT APPROACH:
- Think like a hotel GM who cares about every detail
- Use data to drive every recommendation
- Focus on guest experience and revenue optimization
- Identify problems before they escalate
- Provide specific, actionable solutions

CONVERSATION STYLE:
- Continue smoothly from previous context - no formal introductions
- Reference patterns you've noticed: "I see from the April data..." 
- Ask strategic questions: "Have you considered...?"
- Share quick wins: "Here's what we should tackle first..."
- Think revenue impact: "This could increase satisfaction by..."

${conversationContext}

RESPONSE PATTERN:
1. Quick insight or observation
2. Specific recommendation with data backing
3. Next logical question or follow-up action

Remember: You're Marcus, not "an AI." You know this hotel inside and out. You've analyzed every review, every trend, every operational challenge. Speak with that expertise and familiarity.`;

    console.log('✅ Personalized consultant personality generated');
    return systemPrompt;
  }

  static formatConversationalResponse(aiResponse: string, context: any): string {
    console.log('💬 Formatting response for natural conversation flow...');
    
    // Remove technical prefixes and formal language
    let response = aiResponse
      .replace(/^(Based on|According to|Looking at|From the).+?[,:]\\s*/i, '')
      .replace(/^(I can see|I notice|The data shows).+?[,:]\\s*/i, '')
      .replace(/\\*\\*(.*?)\\*\\*/g, '$1') // Remove bold formatting
      .replace(/^\\d+\\.\\s+/gm, '• ') // Convert numbered lists to bullets
      .replace(/^-\\s+/gm, '• '); // Standardize bullet points

    // Add conversational transitions
    const conversationalStarters = [
      "Looking at your recent data, ",
      "I noticed something interesting - ",
      "Here's what stands out to me: ",
      "Quick observation: ",
      "This is important - "
    ];

    // Add natural follow-ups
    const naturalEndings = [
      " What's your take on this?",
      " Should we dive deeper into this area?",
      " Want me to analyze the specific causes?",
      " How does this align with what you're seeing operationally?",
      " Ready to tackle this together?"
    ];

    // Apply conversational style if response is too formal
    if (response.length > 300 || response.includes('comprehensive') || response.includes('analysis')) {
      const sentences = response.split('. ');
      if (sentences.length > 3) {
        // Keep first 2 sentences, add a follow-up question
        response = sentences.slice(0, 2).join('. ') + '. ' + 
          naturalEndings[Math.floor(Math.random() * naturalEndings.length)];
      }
    }

    // Ensure conversational flow
    if (!response.match(/^(Looking|I |Here's|Quick|This|Your)/)) {
      const starter = conversationalStarters[Math.floor(Math.random() * conversationalStarters.length)];
      response = starter + response.charAt(0).toLowerCase() + response.slice(1);
    }

    console.log('✅ Response formatted for natural conversation');
    return response;
  }

  static addConversationMemory(userMessage: string, aiResponse: string, insights: any): any {
    console.log('🧠 Building conversation memory for context continuity...');
    
    const memory = {
      timestamp: new Date().toISOString(),
      userMessage: userMessage,
      aiResponse: aiResponse,
      context: {
        topicsDiscussed: this.extractTopics(userMessage),
        dataPointsReferenced: this.extractDataReferences(aiResponse),
        recommendationsMade: this.extractRecommendations(aiResponse),
        urgencyLevel: this.assessUrgency(userMessage, insights),
        followUpNeeded: this.identifyFollowUp(userMessage, aiResponse)
      },
      insights: {
        sentimentTrend: insights.sentimentData?.trends || {},
        keyMetrics: {
          satisfactionRate: insights.sentimentData?.overall || {},
          complaintRate: insights.behaviorPatterns?.communicationPatterns?.complaintsEscalated || 0
        }
      }
    };

    return memory;
  }

  private static extractTopics(message: string): string[] {
    const topics = [];
    const topicKeywords = {
      'reviews': ['review', 'rating', 'feedback', 'guest opinion'],
      'operations': ['operation', 'service', 'staff', 'procedure'],
      'revenue': ['revenue', 'profit', 'booking', 'rate'],
      'guest_experience': ['guest', 'customer', 'experience', 'satisfaction'],
      'training': ['train', 'skill', 'development', 'education'],
      'amenities': ['pool', 'gym', 'spa', 'restaurant', 'wifi']
    };

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
        topics.push(topic);
      }
    });

    return topics;
  }

  private static extractDataReferences(response: string): string[] {
    const dataRefs = [];
    if (response.includes('review')) dataRefs.push('reviews');
    if (response.includes('score') || response.includes('rating')) dataRefs.push('scores');
    if (response.includes('trend')) dataRefs.push('trends');
    if (response.includes('platform')) dataRefs.push('platforms');
    return dataRefs;
  }

  private static extractRecommendations(response: string): string[] {
    const recommendations = [];
    if (response.includes('should') || response.includes('recommend')) recommendations.push('actionable_advice');
    if (response.includes('training')) recommendations.push('staff_training');
    if (response.includes('SOP') || response.includes('procedure')) recommendations.push('sop_revision');
    return recommendations;
  }

  private static assessUrgency(message: string, insights: any): 'high' | 'medium' | 'low' {
    if (message.toLowerCase().includes('urgent') || 
        message.toLowerCase().includes('immediate') ||
        insights?.recommendations?.immediate?.length > 0) {
      return 'high';
    }
    if (insights?.sentimentData?.trends?.recentDrop) {
      return 'medium';
    }
    return 'low';
  }

  private static identifyFollowUp(userMessage: string, aiResponse: string): string[] {
    const followUps = [];
    
    if (aiResponse.includes('analyze')) followUps.push('deep_dive_analysis');
    if (aiResponse.includes('implement')) followUps.push('implementation_planning');
    if (aiResponse.includes('monitor')) followUps.push('performance_tracking');
    if (userMessage.includes('?')) followUps.push('answer_clarification');
    
    return followUps;
  }
}
