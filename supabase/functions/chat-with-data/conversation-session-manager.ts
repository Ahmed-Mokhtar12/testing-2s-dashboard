export class ConversationSessionManager {
  static async saveConversationWithContext(
    supabase: any,
    userMessage: string,
    aiResponse: string,
    sessionId?: string,
    context?: any
  ): Promise<void> {
    try {
      const conversationEntry = {
        sender: sessionId || 'Guest',
        recipient: 'Two Seasons Hotel AI Consultant',
        message: this.formatConversationEntry(userMessage, aiResponse, context),
        created_at: new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('LongTermMemory')
        .insert(conversationEntry);
      
      if (error) {
        console.error('💾 Failed to save conversation:', error);
        return;
      }
      
      console.log('💾 Conversation saved successfully with context');
      
      // Also save to website_chats for session management
      if (sessionId) {
        await this.saveToWebsiteChats(supabase, userMessage, aiResponse, sessionId);
      }
      
    } catch (error) {
      console.error('💾 Error in conversation saving:', error);
      // Don't throw error to avoid breaking the response
    }
  }
  
  private static formatConversationEntry(userMessage: string, aiResponse: string, context?: any): string {
    let formatted = `👤 User: ${userMessage}\n🤖 Consultant: ${aiResponse}`;
    
    if (context) {
      formatted += `\n📊 Context: ${JSON.stringify({
        queryType: context.queryType,
        hasData: !!context.specificData,
        timestamp: new Date().toISOString()
      })}`;
    }
    
    return formatted;
  }
  
  private static async saveToWebsiteChats(
    supabase: any,
    userMessage: string,
    aiResponse: string,
    sessionId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('website_chats')
        .insert({
          session_id: sessionId,
          user_message: userMessage,
          ai_response: aiResponse,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        console.warn('⚠️ Failed to save to website_chats:', error);
      } else {
        console.log('💾 Saved to website_chats successfully');
      }
    } catch (error) {
      console.warn('⚠️ Error saving to website_chats:', error);
    }
  }
  
  static async getConversationHistory(
    supabase: any,
    sessionId?: string,
    limit: number = 20
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('LongTermMemory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (sessionId) {
        query = query.eq('sender', sessionId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('📚 Error retrieving conversation history:', error);
        return [];
      }
      
      console.log('📚 Retrieved conversation history:', {
        count: data?.length || 0,
        sessionId: sessionId || 'all'
      });
      
      return data || [];
    } catch (error) {
      console.error('📚 Error in conversation history retrieval:', error);
      return [];
    }
  }
  
  static extractKeyDataPoints(conversationHistory: any[]): Map<string, any> {
    const dataPoints = new Map<string, any>();
    
    if (!conversationHistory || conversationHistory.length === 0) {
      return dataPoints;
    }
    
    // Extract key metrics from recent conversations
    conversationHistory.slice(0, 10).forEach(entry => {
      if (entry.message) {
        const message = entry.message.toLowerCase();
        
        // Extract scores and ratings
        const scoreMatches = message.match(/(\d+\.?\d*)\s*(score|rating|out of|\/)/g);
        if (scoreMatches) {
          scoreMatches.forEach(match => {
            const value = match.match(/(\d+\.?\d*)/)?.[1];
            if (value) {
              dataPoints.set('recent_score', parseFloat(value));
              dataPoints.set('score_context', match);
            }
          });
        }
        
        // Extract time periods
        const timeMatches = message.match(/(january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|last month|this month)/g);
        if (timeMatches) {
          dataPoints.set('time_period', timeMatches[timeMatches.length - 1]);
        }
        
        // Extract topics
        const topics = ['reviews', 'staff', 'service', 'operations', 'guest', 'revenue', 'training', 'satisfaction', 'complaints', 'amenities', 'pool', 'restaurant'];
        topics.forEach(topic => {
          if (message.includes(topic)) {
            const currentTopics = dataPoints.get('topics') || [];
            if (!currentTopics.includes(topic)) {
              currentTopics.push(topic);
              dataPoints.set('topics', currentTopics);
            }
          }
        });
      }
    });
    
    console.log('🔍 Extracted data points:', {
      count: dataPoints.size,
      points: Array.from(dataPoints.keys())
    });
    
    return dataPoints;
  }
}