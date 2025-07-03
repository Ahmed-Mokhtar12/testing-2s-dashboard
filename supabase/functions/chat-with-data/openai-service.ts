import { SearchService } from './search-service.ts';

export async function callOpenAI(context: string, message: string): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('🤖 Calling OpenAI with intelligent context and function calling...');
  console.log(`📏 Context length: ${context.length} characters`);

  // Get available search functions
  const searchService = new SearchService();
  const searchFunctions = searchService.getAvailableFunctions();

  // Check if this is a hotel-related query that requires website search
  const lowerMessage = message.toLowerCase();
  const requiresWebsiteSearch = 
    lowerMessage.includes('booking') || 
    lowerMessage.includes('policy') || 
    lowerMessage.includes('policies') ||
    lowerMessage.includes('offer') || 
    lowerMessage.includes('offers') ||
    lowerMessage.includes('room') || 
    lowerMessage.includes('amenity') || 
    lowerMessage.includes('amenities') ||
    lowerMessage.includes('service') || 
    lowerMessage.includes('services') ||
    lowerMessage.includes('restaurant') || 
    lowerMessage.includes('dining') ||
    lowerMessage.includes('spa') || 
    lowerMessage.includes('contact') ||
    lowerMessage.includes('location') || 
    lowerMessage.includes('price') || 
    lowerMessage.includes('rate') ||
    lowerMessage.includes('two seasons') || 
    lowerMessage.includes('hotel');

  if (requiresWebsiteSearch) {
    console.log('🌐 Website search required - forcing search_web function call');
  }

  // First API call to get the initial response
  const initialResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14',
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      tools: [
        ...searchFunctions.map(func => ({
          type: 'function',
          function: func
        })),
        {
          type: 'function',
          function: {
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
          }
        },
        {
          type: 'function',
          function: {
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
          }
        },
        {
          type: 'function',
          function: {
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
        }
      ],
      tool_choice: requiresWebsiteSearch ? {
        type: 'function',
        function: { name: 'search_web' }
      } : 'auto'
    }),
  });

  if (!initialResponse.ok) {
    throw new Error(`OpenAI API Error: ${initialResponse.statusText}`);
  }

  const initialData = await initialResponse.json();
  const choice = initialData.choices[0];

  // Check if AI wants to call search functions
  if (choice.message.tool_calls) {
    const toolCalls = choice.message.tool_calls;
    const messages = [
      { role: 'system', content: context },
      { role: 'user', content: message },
      choice.message
    ];

    // Execute function calls
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      if (functionName === 'search_web' || functionName === 'get_current_datetime') {
        try {
          console.log(`🔍 Executing ${functionName} function...`);
          const result = await searchService.executeFunction(functionName, functionArgs);
          
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        } catch (error) {
          console.error(`❌ Error executing ${functionName}:`, error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error executing ${functionName}: ${error.message}`
          });
        }
      } else {
        // For action functions (email, SMS, WhatsApp), return the original choice
        console.log(`📧 Action function detected: ${functionName}`);
        return choice;
      }
    }

    // Make second API call with function results
    const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500,
        tools: [
          {
            type: 'function',
            function: {
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
            }
          },
          {
            type: 'function',
            function: {
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
            }
          },
          {
            type: 'function',
            function: {
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
          }
        ],
        tool_choice: 'auto'
      }),
    });

    if (!finalResponse.ok) {
      throw new Error(`OpenAI API Error: ${finalResponse.statusText}`);
    }

    const finalData = await finalResponse.json();
    return finalData.choices[0];
  }

  return choice;
}