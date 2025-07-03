export async function callOpenAI(context: string, message: string): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('🤖 Calling OpenAI with intelligent context and function calling...');
  console.log(`📏 Context length: ${context.length} characters`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      functions: [
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
          description: 'Send an SMS to a specified phone number',
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
      ],
      function_call: 'auto'
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0];
}