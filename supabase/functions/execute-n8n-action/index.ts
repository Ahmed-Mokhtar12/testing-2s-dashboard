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

const N8N_WEBHOOK_URL = 'https://n8n-2seasons-u38985.vm.elestio.app/mcp/9b5a9d48-7f82-41b1-9028-4b06dd9be790/sse';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 N8N Action Executor starting...');
    const actionRequest: ActionRequest = await req.json();
    
    console.log('📩 Received action request:', actionRequest);

    // Prepare webhook payload based on action type
    let webhookPayload: any = {
      action: actionRequest.type,
      message: actionRequest.message,
      messageId: actionRequest.messageId,
      timestamp: new Date().toISOString(),
    };

    // Add type-specific data
    switch (actionRequest.type) {
      case 'email':
        webhookPayload = {
          ...webhookPayload,
          recipient: actionRequest.recipient,
          subject: actionRequest.subject || 'Message from Two Seasons Hotel AI',
        };
        break;
      
      case 'sms':
      case 'whatsapp':
        webhookPayload = {
          ...webhookPayload,
          phoneNumber: actionRequest.phoneNumber,
        };
        break;
    }

    console.log('📤 Sending payload to N8N:', webhookPayload);

    // Call N8N webhook
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    console.log('📨 N8N Response status:', n8nResponse.status);

    let responseData: any = { success: true };
    
    try {
      // Try to parse response if it's JSON
      const responseText = await n8nResponse.text();
      if (responseText) {
        responseData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.log('ℹ️ N8N response was not JSON, treating as success');
    }

    if (!n8nResponse.ok) {
      throw new Error(`N8N webhook failed with status: ${n8nResponse.status}`);
    }

    const response = {
      success: true,
      actionType: actionRequest.type,
      messageId: actionRequest.messageId,
      timestamp: new Date().toISOString(),
      n8nResponse: responseData,
      message: `${actionRequest.type} action executed successfully`
    };

    console.log('✅ Action executed successfully');
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Error in N8N action executor:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Failed to execute action'
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});