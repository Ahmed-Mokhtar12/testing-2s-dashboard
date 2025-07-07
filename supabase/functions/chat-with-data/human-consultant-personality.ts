import { ConversationContextAnalyzer } from './conversation-context-analyzer.ts';
import { SystemPromptBuilder } from './system-prompt-builder.ts';
import { ConversationMemoryManager } from './conversation-memory-manager.ts';
import { ResponseFormatter } from './response-formatter.ts';

export class HumanConsultantPersonality {
  
  static generatePersonalizedSystemPrompt(userHistory?: any[], currentMessage?: string): string {
    console.log('👤 Generating personalized consultant personality with conversation context...');
    
    // Analyze conversation history and extract context
    const conversationData = ConversationContextAnalyzer.analyzeConversationHistory(userHistory);
    
    // Build the system prompt with the analyzed data
    const systemPrompt = SystemPromptBuilder.buildConsultantPrompt(conversationData);
    
    console.log('✅ Personalized consultant personality generated');
    return systemPrompt;
  }

  static formatConversationalResponse(aiResponse: string, context: any): string {
    return ResponseFormatter.formatConversationalResponse(aiResponse, context);
  }

  static addConversationMemory(userMessage: string, aiResponse: string, insights: any): any {
    return ConversationMemoryManager.createMemoryEntry(userMessage, aiResponse, insights);
  }
}