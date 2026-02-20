export interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}

export class OpenAIClient {
  private config: OpenAIConfig;

  constructor() {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    this.config = {
      apiKey,
      model: 'gpt-4.1-2025-04-14',
      temperature: 0.7,
      maxTokens: 1500
    };
  }

  async makeRequest(
    messages: OpenAIMessage[],
    tools?: any[],
    toolChoice?: any
  ): Promise<OpenAIResponse> {
    console.log('🤖 Making OpenAI API request...');
    console.log(`📝 Messages count: ${messages.length}`);
    console.log(`🔧 Tools available: ${tools?.length || 0}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        tools: tools?.map(tool => ({
          type: 'function',
          function: tool
        })),
        tool_choice: toolChoice || 'auto'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API Error:', { 
        status: response.status, 
        statusText: response.statusText,
        body: errorText 
      });
      throw new Error(`OpenAI API Error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ OpenAI API request successful');
    
    return data;
  }

  createMessages(context: string, userMessage: string, consultantPrompt?: string, conversationHistory?: Array<{user_message: string; ai_response: string}>): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: consultantPrompt || context }
    ];

    // Inject real conversation history so the AI truly remembers past exchanges
    if (conversationHistory && conversationHistory.length > 0) {
      // Send last 10 exchanges (user + assistant pairs) for strong memory
      const recentHistory = conversationHistory.slice(-10);
      for (const exchange of recentHistory) {
        if (exchange.user_message) {
          messages.push({ role: 'user', content: exchange.user_message });
        }
        if (exchange.ai_response) {
          messages.push({ role: 'assistant', content: exchange.ai_response });
        }
      }
    }

    // Current user message is always last
    messages.push({ role: 'user', content: userMessage });

    console.log(`📝 Conversation history injected: ${conversationHistory?.length || 0} past exchanges → ${messages.length} total messages`);

    return messages;
  }

  addToolResponse(messages: OpenAIMessage[], toolCallId: string, result: string): OpenAIMessage[] {
    return [
      ...messages,
      {
        role: 'tool',
        tool_call_id: toolCallId,
        content: result
      }
    ];
  }
}