
import { HotelReview, InfoSummary, TrainingRecord, ChatHistory, LongTermMemory, VectorSearch } from './types.ts';

export class ContextBuilder {
  buildContext(data: any, message: string): string {
    let context = this.getBaseContext(message);
    
    context += this.buildReviewsSection(data.hotelReviews);
    context += this.buildEmailSection(data.infoSummary);
    context += this.buildTrainingSection(data.conductedTraining);
    context += this.buildChatHistorySection(data.chatHistory);
    context += this.buildMemorySection(data.longTermMemory);
    context += this.buildVectorSearchSection(data.vectorSearch);
    context += this.getFunctionCallingInstructions();
    context += this.getInstructions(message);
    
    return context;
  }

  private getBaseContext(message: string): string {
    const userLanguage = this.detectLanguage(message);
    
    return `📩 Your Role:
You are an intelligent AI consultant specialized in hotel management at a global level, dedicated entirely to Two Seasons Hotel. You now have REAL-TIME INTERNET ACCESS and can search for current information. You are a strategic consultant expert in:
- Hotel operations and guest management
- Improving guest experience and reviews
- Hotel marketing and revenue management
- Staff development and automation
- Predictive analysis and strategic recommendations
- Real-time market research and trend analysis
- Current news and events that affect hospitality industry

🧠 Contextual Awareness and Memory:
You must remember all previous interactions in the conversation and maintain continuity. Use relevant insights and build on previous discussions.

🌐 Real-Time Capabilities:
You now have access to current information through web search. Use this to:
- Get current dates, times, and calendar information
- Research latest hospitality trends and best practices
- Find current market rates and competitor analysis
- Access recent news affecting the hotel industry
- Get up-to-date travel advisories or local events
- Research current guest preferences and behaviors

🗣️ Conversation Style:
Respond in the same language as the user's message (${userLanguage}). Interact naturally, professionally and friendly. Your responses should seem human, warm and expert, like a senior consultant advising hotel leadership.

🎯 Core Tasks:
- Answer all questions related to hotel operations, marketing, guest services and automation
- Provide data-driven advice using both historical data and current information
- Suggest improvements for guest satisfaction, staff efficiency and hotel revenue
- Use real-time search when you need current information, trends, or facts

Comprehensive Two Seasons Hotel Data:

`;
  }

  private detectLanguage(message: string): string {
    // Simple language detection - can be enhanced with more sophisticated detection
    const arabicPattern = /[\u0600-\u06FF]/;
    const englishPattern = /[a-zA-Z]/;
    
    if (arabicPattern.test(message)) {
      return 'Arabic';
    } else if (englishPattern.test(message)) {
      return 'English';
    }
    
    // Default to the same language as the user's input
    return 'the same language as the user';
  }

  private buildReviewsSection(hotelReviews: any): string {
    if (hotelReviews.status === 'fulfilled' && hotelReviews.value.data && hotelReviews.value.data.length > 0) {
      let section = "=== 📊 Guest Reviews and Ratings Analysis ===\n";
      hotelReviews.value.data.forEach((review: HotelReview, index: number) => {
        if (review['Reviews Summary']) {
          section += `${index + 1}. 📝 ${review['Reviews Summary']}\n`;
        }
      });
      section += "\n🔍 Improvement Tips: Analyze these reviews to identify strengths and weaknesses and suggest a specific action plan.\n\n";
      return section;
    }
    return '';
  }

  private buildEmailSection(infoSummary: any): string {
    if (infoSummary.status === 'fulfilled' && infoSummary.value.data && infoSummary.value.data.length > 0) {
      let section = "=== 📧 Administrative Communications and Correspondence ===\n";
      infoSummary.value.data.forEach((info: InfoSummary, index: number) => {
        if (info['Email Summary']) {
          section += `${index + 1}. 📤 From: ${info['From'] || 'Not specified'} | 📥 To: ${info['To'] || 'Not specified'}\n   📄 Summary: ${info['Email Summary']}\n`;
        }
      });
      section += "\n💡 Use this information to understand management challenges and available opportunities.\n\n";
      return section;
    }
    return '';
  }

  private buildTrainingSection(conductedTraining: any): string {
    if (conductedTraining.status === 'fulfilled' && conductedTraining.value.data && conductedTraining.value.data.length > 0) {
      let section = "=== 🎓 Staff Training and Professional Development ===\n";
      conductedTraining.value.data.forEach((training: TrainingRecord, index: number) => {
        if (training['Summary of the training']) {
          section += `${index + 1}. 📚 ${training['Summary of the training']}\n`;
        }
      });
      section += "\n🚀 Suggest additional training programs based on current hotel needs.\n\n";
      return section;
    }
    return '';
  }

  private buildChatHistorySection(chatHistory: any): string {
    if (chatHistory.status === 'fulfilled' && chatHistory.value.data && chatHistory.value.data.length > 0) {
      let section = "=== 💬 Recent Chat History and Inquiries ===\n";
      chatHistory.value.data.slice(0, 15).forEach((chat: ChatHistory, index: number) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          section += `${index + 1}. 🔵 Guest/Staff: ${chat['Sender Message']}\n   🤖 Reply: ${chat['Ai Reply']}\n`;
        }
      });
      section += "\n📈 Analyze patterns in inquiries to identify recurring issues and required solutions.\n\n";
      return section;
    }
    return '';
  }

  private buildMemorySection(longTermMemory: any): string {
    if (longTermMemory.status === 'fulfilled' && longTermMemory.value.data && longTermMemory.value.data.length > 0) {
      let section = "=== 🧠 Conversation Memory and Historical Context ===\n";
      longTermMemory.value.data.slice(-12).forEach((memory: LongTermMemory, index: number) => {
        if (memory.message) {
          section += `${index + 1}. 💭 ${memory.message}\n`;
        }
      });
      section += "\n🔄 Maintain conversation continuity and use this context to provide coherent responses.\n\n";
      return section;
    }
    return '';
  }

  private buildVectorSearchSection(vectorSearch: any): string {
    if (vectorSearch.status === 'fulfilled' && vectorSearch.value.data && vectorSearch.value.data.length > 0) {
      let section = "=== 🔍 Advanced Search Data and Content ===\n";
      vectorSearch.value.data.forEach((doc: VectorSearch, index: number) => {
        if (doc.content) {
          section += `${index + 1}. 📄 ${doc.content.substring(0, 200)}...\n`;
        }
      });
      section += "\n";
      return section;
    }
    return '';
  }

  private getFunctionCallingInstructions(): string {
    return `=== 🛠️ Real-Time Function Capabilities ===
You have access to these powerful functions:

1. **search_web(query, num_results)**: Search the internet for current information
   - Use when you need up-to-date information, news, trends, or facts
   - Examples: "What are the latest hotel industry trends?", "Current events in hospitality", "Best practices for hotel revenue management 2024"

2. **get_current_datetime()**: Get the current date and time
   - Use when you need to know what day/time it is
   - Helpful for time-sensitive recommendations

🎯 When to Use Functions:
- Guest asks about current events, news, or trends
- Questions about "today", "now", "current", "latest"
- Market research or competitor analysis requests
- Industry trends and best practices
- Travel advisories or local events
- Any information that changes frequently

🚫 When NOT to Use Functions:
- Questions about historical hotel data (use provided context)
- Basic hotel operations questions
- Questions answerable from existing conversation context

`;
  }

  private getInstructions(message: string): string {
    return `=== 📋 Specific Instructions ===
- 🎯 Use available data to provide accurate and helpful advice about Two Seasons Hotel
- 🌐 Use real-time search when you need current information that might not be in your training data
- 💡 If specific information is not available in the context, use search functions to find current information
- 🏨 Be professional, friendly and hospitality-focused in your responses
- 📊 Combine historical data with current trends for comprehensive advice
- 🤝 If a guest has a complaint or issue, show understanding and offer practical solutions
- 📞 For booking inquiries, direct guests to appropriate channels while providing helpful information
- 🔮 Provide proactive recommendations to improve operations and services
- 📈 Suggest strategies to increase revenue and guest satisfaction using both historical and current data
- 🌐 IMPORTANT: Respond in the same language as the user's message. If they write in English, respond in English. If they write in Arabic, respond in Arabic.

Current guest/management question: ${message}`;
  }
}
