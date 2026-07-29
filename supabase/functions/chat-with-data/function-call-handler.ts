import { SearchService } from './search-service.ts';
import { OpenAIMessage } from './openai-client.ts';
import { TrainingQueryService, TRAINING_TOOL_NAME } from './training-query-service.ts';
import { WhatsAppQueryService, WHATSAPP_TOOL_NAME } from './whatsapp-query-service.ts';
import { ReviewsQueryService, REVIEWS_TOOL_NAME } from './reviews-query-service.ts';
import { EmailsQueryService, EMAILS_TOOL_NAME } from './emails-query-service.ts';
import { RatesQueryService, RATES_TOOL_NAME } from './rates-query-service.ts';

export const QUERY_TOOL_NAMES = [TRAINING_TOOL_NAME, WHATSAPP_TOOL_NAME, REVIEWS_TOOL_NAME, EMAILS_TOOL_NAME, RATES_TOOL_NAME];

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface FunctionExecutionResult {
  shouldReturnEarly: boolean;
  messages: OpenAIMessage[];
  earlyReturnChoice?: any;
}

export class FunctionCallHandler {
  private searchService: SearchService;
  private trainingQueryService: TrainingQueryService;
  private whatsappQueryService: WhatsAppQueryService;
  private reviewsQueryService: ReviewsQueryService;
  private emailsQueryService: EmailsQueryService;
  private ratesQueryService: RatesQueryService;

  constructor(authHeader?: string) {
    this.searchService = new SearchService();
    this.trainingQueryService = new TrainingQueryService(authHeader);
    this.whatsappQueryService = new WhatsAppQueryService(authHeader);
    this.reviewsQueryService = new ReviewsQueryService(authHeader);
    this.emailsQueryService = new EmailsQueryService(authHeader);
    this.ratesQueryService = new RatesQueryService(authHeader);
  }

  getAvailableTools(): any[] {
    const searchFunctions = this.searchService.getAvailableFunctions();
    const trainingFunctions = this.trainingQueryService.getAvailableFunctions();
    const whatsappFunctions = this.whatsappQueryService.getAvailableFunctions();
    const reviewsFunctions = this.reviewsQueryService.getAvailableFunctions();
    const emailsFunctions = this.emailsQueryService.getAvailableFunctions();
    const ratesFunctions = this.ratesQueryService.getAvailableFunctions();
    const actionFunctions = this.getActionFunctions();

    return [...searchFunctions, ...trainingFunctions, ...whatsappFunctions, ...reviewsFunctions, ...emailsFunctions, ...ratesFunctions, ...actionFunctions];
  }
  
  getActionFunctions(): any[] {
    // Sending actions (email, SMS, WhatsApp) are disabled in this product.
    // Sera should always respond with text — never invoke a send_* tool.
    return [];
  }

  async executeToolCalls(
    toolCalls: ToolCall[], 
    baseMessages: OpenAIMessage[]
  ): Promise<FunctionExecutionResult> {
    console.log(`🔧 Executing ${toolCalls.length} tool calls...`);
    
    const messages = [...baseMessages];
    
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      console.log(`🎯 Processing function: ${functionName}`);
      
      if (this.isSearchFunction(functionName)) {
        const result = await this.executeSearchFunction(functionName, functionArgs, toolCall.id);
        messages.push(...result);
      } else if (this.isActionFunction(functionName)) {
        console.log(`🚫 Disabled action function requested by model: ${functionName}`);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: 'Sending actions are disabled in this product. Reply to the user with a normal text answer only. Do not ask for confirmation and do not generate send_email, send_sms, or send_whatsapp actions.'
        });
      } else if (functionName === TRAINING_TOOL_NAME) {
        const content = await this.trainingQueryService.executeFunction(functionName, functionArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content
        });
      } else if (functionName === WHATSAPP_TOOL_NAME) {
        const content = await this.whatsappQueryService.executeFunction(functionName, functionArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content
        });
      } else if (functionName === REVIEWS_TOOL_NAME) {
        const content = await this.reviewsQueryService.executeFunction(functionName, functionArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content
        });
      } else if (functionName === EMAILS_TOOL_NAME) {
        const content = await this.emailsQueryService.executeFunction(functionName, functionArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content
        });
      } else if (functionName === RATES_TOOL_NAME) {
        const content = await this.ratesQueryService.executeFunction(functionName, functionArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content
        });
      } else {
        console.warn(`⚠️ Unknown function: ${functionName}`);
      }
    }
    
    return {
      shouldReturnEarly: false,
      messages
    };
  }
  
  private isSearchFunction(functionName: string): boolean {
    return functionName === 'search_web' || functionName === 'get_current_datetime';
  }
  
  private isActionFunction(functionName: string): boolean {
    return functionName === 'send_email' || functionName === 'send_sms' || functionName === 'send_whatsapp';
  }
  
  private async executeSearchFunction(
    functionName: string, 
    functionArgs: any, 
    toolCallId: string
  ): Promise<OpenAIMessage[]> {
    try {
      console.log(`🔍 Executing ${functionName} function with args:`, functionArgs);
      const result = await this.searchService.executeFunction(functionName, functionArgs);
      console.log(`✅ Function ${functionName} completed successfully`);
      
      return [{
        role: 'tool',
        tool_call_id: toolCallId,
        content: result
      }];
    } catch (error) {
      console.error(`❌ Error executing ${functionName}:`, error);
      console.error(`❌ Full error details:`, {
        message: error.message,
        stack: error.stack,
        functionName,
        functionArgs
      });
      
      const errorMessage = `⚠️ البحث الإلكتروني غير متاح حالياً. سأقدم لك المعلومات المتوفرة من قاعدة البيانات بدلاً من ذلك.`;
      
      return [{
        role: 'tool',
        tool_call_id: toolCallId,
        content: errorMessage
      }];
    }
  }
}