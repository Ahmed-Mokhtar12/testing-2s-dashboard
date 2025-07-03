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

// MCP Protocol Interfaces
interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

// MCP endpoint
const N8N_MCP_URL = 'https://n8n-2seasons-u38985.vm.elestio.app/mcp/9b5a9d48-7f82-41b1-9028-4b06dd9be790';

console.log('🔧 N8N MCP URL configured:', N8N_MCP_URL);

// MCP Client class for proper protocol implementation
class MCPClient {
  private url: string;
  private requestId: number = 1;
  private initialized: boolean = false;
  private availableTools: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  private generateRequestId(): number {
    return this.requestId++;
  }

  private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    console.log('📤 Sending MCP request:', request);
    
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Supabase-Edge-Function-MCP/1.0',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP request failed with status ${response.status}: ${await response.text()}`);
    }

    const responseData = await response.json();
    console.log('📥 Received MCP response:', responseData);
    
    return responseData;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing MCP client...');
    
    // Step 1: Initialize the connection
    const initRequest: MCPRequest = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: "Supabase-Edge-Function",
          version: "1.0.0"
        }
      }
    };

    const initResponse = await this.sendRequest(initRequest);
    
    if (initResponse.error) {
      throw new Error(`MCP initialization failed: ${initResponse.error.message}`);
    }

    // Step 2: Send initialized notification
    const initializedNotification: MCPNotification = {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    };

    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initializedNotification),
    });

    // Step 3: List available tools
    await this.listTools();
    
    this.initialized = true;
    console.log('✅ MCP client initialized successfully');
  }

  async listTools(): Promise<void> {
    const listToolsRequest: MCPRequest = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "tools/list"
    };

    const response = await this.sendRequest(listToolsRequest);
    
    if (response.error) {
      console.warn('⚠️ Could not list tools:', response.error.message);
      return;
    }

    if (response.result?.tools) {
      this.availableTools = response.result.tools.map((tool: any) => tool.name);
      console.log('🔧 Available tools:', this.availableTools);
    }
  }

  async callTool(toolName: string, arguments_: Record<string, any>): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`🔧 Calling tool: ${toolName} with arguments:`, arguments_);

    const toolCallRequest: MCPRequest = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: arguments_
      }
    };

    const response = await this.sendRequest(toolCallRequest);
    
    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }
}

// Global MCP client instance
const mcpClient = new MCPClient(N8N_MCP_URL);

// Function to execute action using proper MCP protocol
async function executeActionViaMCP(actionRequest: ActionRequest): Promise<any> {
  console.log('🔧 Executing action via MCP:', actionRequest);
  
  let toolName: string;
  let toolArguments: Record<string, any>;

  // Map action type to MCP tool name and arguments
  switch (actionRequest.type) {
    case 'email':
      if (!actionRequest.recipient) {
        throw new Error('Email action requires recipient');
      }
      toolName = 'microsoft_outlook_send_email';
      toolArguments = {
        to: actionRequest.recipient,
        subject: actionRequest.subject || 'Message from Two Seasons Hotel AI',
        message: actionRequest.message,
        messageId: actionRequest.messageId,
      };
      break;
    
    case 'sms':
      if (!actionRequest.phoneNumber) {
        throw new Error('SMS action requires phoneNumber');
      }
      toolName = 'reson8_send_sms';
      toolArguments = {
        phoneNumber: actionRequest.phoneNumber,
        message: actionRequest.message,
        messageId: actionRequest.messageId,
      };
      break;
    
    case 'whatsapp':
      if (!actionRequest.phoneNumber) {
        throw new Error('WhatsApp action requires phoneNumber');
      }
      toolName = 'reson8_send_whatsapp';
      toolArguments = {
        phoneNumber: actionRequest.phoneNumber,
        message: actionRequest.message,
        messageId: actionRequest.messageId,
      };
      break;
    
    default:
      throw new Error(`Unsupported action type: ${actionRequest.type}`);
  }

  // Execute the tool call using the MCP client
  try {
    const result = await mcpClient.callTool(toolName, toolArguments);
    console.log('✅ MCP tool execution successful:', result);
    return result;
  } catch (error) {
    console.error('❌ MCP tool execution failed:', error);
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

    // Execute action via MCP with retry mechanism
    const maxRetries = 3;
    let mcpResult: any;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 MCP action attempt ${attempt}/${maxRetries}`);
      
      try {
        mcpResult = await executeActionViaMCP(actionRequest);
        console.log('✅ MCP action successful:', mcpResult);
        break;
        
      } catch (mcpError) {
        lastError = mcpError;
        console.error(`❌ MCP action error (attempt ${attempt}):`, mcpError);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to execute MCP action after ${maxRetries} attempts: ${mcpError.message}`);
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
      mcpResult: mcpResult,
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