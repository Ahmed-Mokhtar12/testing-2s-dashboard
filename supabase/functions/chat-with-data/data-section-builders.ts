
import { HotelReview, InfoSummary, TrainingRecord, ChatHistory, LongTermMemory, VectorSearch } from './types.ts';

export class DataSectionBuilders {
  static buildReviewsSection(hotelReviews: any): string {
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

  static buildEmailSection(infoSummary: any): string {
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

  static buildTrainingSection(conductedTraining: any): string {
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

  static buildChatHistorySection(chatHistory: any): string {
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

  static buildMemorySection(longTermMemory: any): string {
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

  static buildVectorSearchSection(vectorSearch: any): string {
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
}
