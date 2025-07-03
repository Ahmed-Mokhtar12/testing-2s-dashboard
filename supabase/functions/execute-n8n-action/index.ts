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

// n8n Webhook configuration
const N8N_BASE_URL = 'https://n8n-2seasons-u38985.vm.elestio.app';
const N8N_WEBHOOK_ID = Deno.env.get('N8N_WEBHOOK_ID') || 'YOUR_WEBHOOK_ID_HERE';

console.log('🔧 N8N Webhook configured:', N8N_WEBHOOK_ID);

// Function to execute action using n8n webhook
async function executeActionViaN8N(actionRequest: ActionRequest): Promise<any> {
  console.log('🔧 Executing action via n8n webhook:', actionRequest);
  
  // Build the webhook URL
  const webhookUrl = `${N8N_BASE_URL}/webhook/${N8N_WEBHOOK_ID}`;
  
  // Prepare workflow input data
  const workflowData = {
    actionType: actionRequest.type,
    recipient: actionRequest.recipient,
    phoneNumber: actionRequest.phoneNumber,
    subject: actionRequest.subject || 'Message from Two Seasons Hotel AI',
    message: actionRequest.message,
    messageId: actionRequest.messageId,
    timestamp: new Date().toISOString()
  };

  console.log('📤 Sending webhook request:', { webhookUrl, workflowData });

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflowData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`n8n webhook execution failed with status ${response.status}: ${errorText}`);
  }

  // Webhooks might return different response formats
  const responseText = await response.text();
  console.log('📥 Received n8n webhook response:', responseText);
  
  // Try to parse as JSON, fallback to text response
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { message: responseText, status: 'success' };
  }
  
  return responseData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 N8N Workflow Action Executor starting...');
    console.log('🔧 Request method:', req.method);
    console.log('🔧 Request headers:', Object.fromEntries(req.headers.entries()));
    
    const actionRequest: ActionRequest = await req.json();
    console.log('📩 Received action request:', actionRequest);

    // Validate action request
    if (!actionRequest.type || !actionRequest.message || !actionRequest.messageId) {
      throw new Error('Invalid action request: missing required fields (type, message, messageId)');
    }

    // Execute action via n8n workflow with retry mechanism
    const maxRetries = 3;
    let workflowResult: any;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 n8n workflow attempt ${attempt}/${maxRetries}`);
      
      try {
        workflowResult = await executeActionViaN8N(actionRequest);
        console.log('✅ n8n workflow execution successful:', workflowResult);
        break;
        
      } catch (workflowError) {
        lastError = workflowError;
        console.error(`❌ n8n workflow error (attempt ${attempt}):`, workflowError);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to execute n8n workflow after ${maxRetries} attempts: ${workflowError.message}`);
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
      workflowResult: workflowResult,
      message: `${actionRequest.type} action executed successfully via n8n workflow`
    };

    console.log('✅ Action executed successfully via n8n workflow');
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Error in N8N workflow action executor:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Failed to execute n8n workflow action'
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});