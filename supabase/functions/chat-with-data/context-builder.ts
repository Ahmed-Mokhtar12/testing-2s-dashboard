
import { BaseContextBuilder } from './base-context-builder.ts';
import { DataSectionBuilders } from './data-section-builders.ts';

export class ContextBuilder extends BaseContextBuilder {
  buildContext(data: any, message: string): string {
    let context = this.getBaseContext(message);
    
    context += DataSectionBuilders.buildReviewsSection(data.hotelReviews);
    context += DataSectionBuilders.buildEmailSection(data.infoSummary);
    context += DataSectionBuilders.buildTrainingSection(data.conductedTraining);
    context += DataSectionBuilders.buildChatHistorySection(data.chatHistory);
    context += DataSectionBuilders.buildMemorySection(data.longTermMemory);
    context += DataSectionBuilders.buildVectorSearchSection(data.vectorSearch);
    context += this.getFunctionCallingInstructions();
    context += this.getInstructions(message);
    
    return context;
  }
}
