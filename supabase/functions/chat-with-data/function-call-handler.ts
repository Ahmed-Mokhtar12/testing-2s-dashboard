import { SearchService } from './search-service.ts';
import { OpenAIMessage } from './openai-client.ts';

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
  
  constructor() {
    this.searchService = new SearchService();
  }
  
  getAvailableTools(): any[] {
    const searchFunctions = this.searchService.getAvailableFunctions();
    const actionFunctions = this.getActionFunctions();
    
    return [...searchFunctions, ...actionFunctions];
  }
  
  getActionFunctions(): any[] {
    return [
      {
        name: 'send_email',
        description: 'Send an email to a specified recipient',
        parameters: {
          type: 'object',
          properties: {
            recipient: { type: 'string', description: 'Email address of the recipient' },
            subject: { type: 'string', description: 'Subject line of the email' },
            message: { type: 'string', description: 'Email message content' }
          },
          required: ['recipient', 'subject', 'message']
        }
      },
      {
        name: 'send_sms',
        description: 'Send an SMS to a specified phone number. Use this when the user asks to send SMS or text message.',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string', description: 'Phone number to send SMS to' },
            message: { type: 'string', description: 'SMS message content' }
          },
          required: ['phoneNumber', 'message']
        }
      },
      {
        name: 'send_whatsapp',
        description: 'Send a WhatsApp message to a specified phone number',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string', description: 'Phone number to send WhatsApp message to' },
            message: { type: 'string', description: 'WhatsApp message content' }
          },
          required: ['phoneNumber', 'message']
        }
      }
    ];
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
        console.log(`📧 Action function detected: ${functionName}`);
        // For action functions, return early with the original choice
        return {
          shouldReturnEarly: true,
          messages,
          earlyReturnChoice: { message: { tool_calls: toolCalls } }
        };
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
    const actionFunctions = ['send_email', 'send_sms', 'send_whatsapp'];
    return actionFunctions.includes(functionName);
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