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

// MCP endpoint (without /sse for direct HTTP communication)
const N8N_MCP_URL = 'https://n8n-2seasons-u38985.vm.elestio.app/mcp/9b5a9d48-7f82-41b1-9028-4b06dd9be790';

console.log('🔧 N8N MCP URL configured:', N8N_MCP_URL);

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

// Function to execute MCP tool call via direct HTTP request
async function executeMCPToolCall(toolCall: MCPToolCall): Promise<MCPResponse> {
  console.log('🔧 Executing MCP tool call:', toolCall);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    // Send MCP tool call directly to the MCP endpoint
    const mcpEndpoint = N8N_MCP_URL;
    console.log('🔧 Sending MCP request to:', mcpEndpoint);
    
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Supabase-Edge-Function-MCP/1.0',
      },
      body: JSON.stringify(toolCall),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('📨 MCP Response status:', response.status);
    console.log('📨 MCP Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ MCP request failed:', response.status, errorText);
      throw new Error(`MCP request failed with status ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('✅ MCP Response data:', responseData);

    return {
      result: responseData,
    };

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ MCP tool call error:', error);
    
    if (error.name === 'AbortError') {
      throw new Error('MCP tool call timeout after 30 seconds');
    }
    
    throw error;
  }
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