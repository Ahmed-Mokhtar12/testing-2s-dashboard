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