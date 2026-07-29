import { composeSystemContent } from './message-composer.ts';

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
    // Use Lovable AI Gateway (preferred) — falls back to OpenAI direct if LOVABLE_API_KEY missing
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const apiKey = lovableKey || openaiKey;

    if (!apiKey) {
      throw new Error('Neither LOVABLE_API_KEY nor OPENAI_API_KEY is configured');
    }

    this.config = {
      apiKey,
      // GPT-5.2 via Lovable AI Gateway — best for consultant-grade reasoning + tool calling
      model: lovableKey ? 'openai/gpt-5.2' : 'gpt-4.1-2025-04-14',
      temperature: 0.7,
      maxTokens: 1500
    };

    console.log(`🤖 OpenAIClient initialized with model: ${this.config.model} (gateway: ${lovableKey ? 'Lovable AI' : 'OpenAI direct'})`);
  }

  async makeRequest(
    messages: OpenAIMessage[],
    tools?: any[],
    toolChoice?: any
  ): Promise<OpenAIResponse> {
    console.log('🤖 Making AI request...');
    console.log(`📝 Messages count: ${messages.length}`);
    console.log(`🔧 Tools available: ${tools?.length || 0}`);

    // Route based on which key is in use
    const isLovableGateway = !!Deno.env.get('LOVABLE_API_KEY');
    const endpoint = isLovableGateway
      ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    // GPT-5.x family requires max_completion_tokens; legacy models use max_tokens
    const isGpt5Family = this.config.model.includes('gpt-5');
    const tokenParam = isGpt5Family
      ? { max_completion_tokens: this.config.maxTokens }
      : { max_tokens: this.config.maxTokens };

    // GPT-5.x only supports default temperature (1) — omit the param
    const tempParam = isGpt5Family ? {} : { temperature: this.config.temperature };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        ...tempParam,
        ...tokenParam,
        tools: tools?.map(tool => ({
          type: 'function',
          function: tool
        })),
        tool_choice: toolChoice || 'auto'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI Gateway Error:', {
        endpoint,
        model: this.config.model,
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      if (response.status === 429) {
        throw new Error('Rate limit exceeded — please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('AI credits exhausted — please add funds at Settings > Workspace > Usage.');
      }
      throw new Error(`AI Gateway Error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ AI request successful');

    return data;
  }

  createMessages(context: string, userMessage: string, consultantPrompt?: string): OpenAIMessage[] {
    return [
      { role: 'system', content: composeSystemContent(consultantPrompt, context) },
      { role: 'user', content: userMessage }
    ];
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