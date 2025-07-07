export interface ConversationMemory {
  timestamp: string;
  userMessage: string;
  aiResponse: string;
  context: {
    topicsDiscussed: string[];
    dataPointsReferenced: string[];
    recommendationsMade: string[];
    urgencyLevel: 'high' | 'medium' | 'low';
    followUpNeeded: string[];
  };
  insights: {
    sentimentTrend: any;
    keyMetrics: {
      satisfactionRate: any;
      complaintRate: number;
    };
  };
}

export class ConversationMemoryManager {
  static createMemoryEntry(userMessage: string, aiResponse: string, insights: any): ConversationMemory {
    console.log('🧠 Building conversation memory for context continuity...');
    
    const memory: ConversationMemory = {
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

    console.log('✅ Conversation memory entry created');
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