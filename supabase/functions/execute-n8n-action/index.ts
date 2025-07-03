import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActionRequest {
  type: 'email' | 'sms' | 'whatsapp';
  recipient?: string;
  phoneNumber?: string;
  subject?: string;
  message: string;
  messageId: string;
}

interface MCPToolCall {
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
}

interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

// MCP SSE endpoint
const N8N_MCP_SSE_URL = 'https://n8n-2seasons-u38985.vm.elestio.app/mcp/9b5a9d48-7f82-41b1-9028-4b06dd9be790/sse';

console.log('🔧 N8N MCP SSE URL configured:', N8N_MCP_SSE_URL);

// Function to create MCP tool call based on action type
function createMCPToolCall(actionRequest: ActionRequest): MCPToolCall {
  const baseArgs = {
    message: actionRequest.message,
    messageId: actionRequest.messageId,
  };

  switch (actionRequest.type) {
    case 'email':
      if (!actionRequest.recipient) {
        throw new Error('Email action requires recipient');
      }
      return {
        method: 'tools/call',
        params: {
          name: 'microsoft_outlook_send_email',
          arguments: {
            ...baseArgs,
            to: actionRequest.recipient,
            subject: actionRequest.subject || 'Message from Two Seasons Hotel AI',
          },
        },
      };
    
    case 'sms':
      if (!actionRequest.phoneNumber) {
        throw new Error('SMS action requires phoneNumber');
      }
      return {
        method: 'tools/call',
        params: {
          name: 'reson8_send_sms',
          arguments: {
            ...baseArgs,
            phoneNumber: actionRequest.phoneNumber,
          },
        },
      };
    
    case 'whatsapp':
      if (!actionRequest.phoneNumber) {
        throw new Error('WhatsApp action requires phoneNumber');
      }
      return {
        method: 'tools/call',
        params: {
          name: 'reson8_send_whatsapp',
          arguments: {
            ...baseArgs,
            phoneNumber: actionRequest.phoneNumber,
          },
        },
      };
    
    default:
      throw new Error(`Unsupported action type: ${actionRequest.type}`);
  }
}

// Function to execute MCP tool call via SSE
async function executeMCPToolCall(toolCall: MCPToolCall): Promise<MCPResponse> {
  console.log('🔧 Executing MCP tool call:', toolCall);
  
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('MCP tool call timeout after 30 seconds'));
    }, 30000);

    // Create SSE connection
    const eventSource = new EventSource(N8N_MCP_SSE_URL, {
      signal: controller.signal,
    });

    let responseReceived = false;

    eventSource.onopen = () => {
      console.log('✅ MCP SSE connection established');
      
      // Send the tool call request
      // Note: EventSource doesn't support sending data directly
      // We need to use a separate POST request to send the tool call
      fetch(N8N_MCP_SSE_URL.replace('/sse', ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(toolCall),
        signal: controller.signal,
      }).catch(error => {
        console.error('❌ Error sending MCP tool call:', error);
        if (!responseReceived) {
          clearTimeout(timeoutId);
          eventSource.close();
          reject(error);
        }
      });
    };

    eventSource.onmessage = (event) => {
      console.log('📨 Received MCP message:', event.data);
      
      try {
        const data = JSON.parse(event.data);
        
        // Check if this is a tool call result
        if (data.method === 'tools/call/result' || data.result || data.error) {
          responseReceived = true;
          clearTimeout(timeoutId);
          eventSource.close();
          
          if (data.error) {
            reject(new Error(`MCP tool call failed: ${data.error.message}`));
          } else {
            resolve(data);
          }
        }
      } catch (parseError) {
        console.error('❌ Error parsing MCP message:', parseError);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ MCP SSE connection error:', error);
      if (!responseReceived) {
        clearTimeout(timeoutId);
        eventSource.close();
        reject(new Error('MCP SSE connection failed'));
      }
    };
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 N8N MCP Action Executor starting...');
    console.log('🔧 Request method:', req.method);
    console.log('🔧 Request headers:', Object.fromEntries(req.headers.entries()));
    
    const actionRequest: ActionRequest = await req.json();
    console.log('📩 Received action request:', actionRequest);

    // Validate action request
    if (!actionRequest.type || !actionRequest.message || !actionRequest.messageId) {
      throw new Error('Invalid action request: missing required fields (type, message, messageId)');
    }

    // Create MCP tool call
    const toolCall = createMCPToolCall(actionRequest);
    console.log('🔧 Created MCP tool call:', toolCall);

    // Execute MCP tool call with retry mechanism
    const maxRetries = 3;
    let mcpResponse: MCPResponse;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 MCP tool call attempt ${attempt}/${maxRetries}`);
      
      try {
        mcpResponse = await executeMCPToolCall(toolCall);
        console.log('✅ MCP tool call successful:', mcpResponse);
        break;
        
      } catch (mcpError) {
        lastError = mcpError;
        console.error(`❌ MCP tool call error (attempt ${attempt}):`, mcpError);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to execute MCP tool call after ${maxRetries} attempts: ${mcpError.message}`);
        }
        
        // Exponential backoff delay
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const response = {
      success: true,
      actionType: actionRequest.type,
      messageId: actionRequest.messageId,
      timestamp: new Date().toISOString(),
      mcpResponse: mcpResponse,
      message: `${actionRequest.type} action executed successfully via MCP`
    };

    console.log('✅ Action executed successfully via MCP');
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Error in N8N MCP action executor:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Failed to execute MCP action'
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});