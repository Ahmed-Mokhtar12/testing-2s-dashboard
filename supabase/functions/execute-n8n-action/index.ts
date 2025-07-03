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

// Enhanced webhook URL validation and configuration
const validateWebhookUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // Check if it's a valid HTTP/HTTPS URL
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    // Check if it's not an SSE endpoint (which ends with /sse)
    if (url.endsWith('/sse')) {
      console.warn('⚠️ WARNING: Webhook URL appears to be an SSE endpoint, not a standard HTTP webhook');
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

// Use the correct production URL provided by user (removing /sse for HTTP POST)
const N8N_WEBHOOK_URL = 'https://n8n-2seasons-u38985.vm.elestio.app/mcp/9b5a9d48-7f82-41b1-9028-4b06dd9be790';

console.log('🔧 N8N Webhook URL configured:', N8N_WEBHOOK_URL);
console.log('🔧 URL validation result:', validateWebhookUrl(N8N_WEBHOOK_URL));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 N8N Action Executor starting...');
    console.log('🔧 Request method:', req.method);
    console.log('🔧 Request headers:', Object.fromEntries(req.headers.entries()));
    
    // Validate webhook URL first
    if (!validateWebhookUrl(N8N_WEBHOOK_URL)) {
      throw new Error(`Invalid webhook URL: ${N8N_WEBHOOK_URL}. Please check the URL format and ensure it's not an SSE endpoint.`);
    }
    
    const actionRequest: ActionRequest = await req.json();
    console.log('📩 Received action request:', actionRequest);

    // Validate action request
    if (!actionRequest.type || !actionRequest.message || !actionRequest.messageId) {
      throw new Error('Invalid action request: missing required fields (type, message, messageId)');
    }

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
        if (!actionRequest.recipient) {
          throw new Error('Email action requires recipient');
        }
        webhookPayload = {
          ...webhookPayload,
          recipient: actionRequest.recipient,
          subject: actionRequest.subject || 'Message from Two Seasons Hotel AI',
        };
        break;
      
      case 'sms':
      case 'whatsapp':
        if (!actionRequest.phoneNumber) {
          throw new Error(`${actionRequest.type} action requires phoneNumber`);
        }
        webhookPayload = {
          ...webhookPayload,
          phoneNumber: actionRequest.phoneNumber,
        };
        break;
        
      default:
        throw new Error(`Unsupported action type: ${actionRequest.type}`);
    }

    console.log('📤 Sending payload to N8N:', webhookPayload);

    // Retry mechanism with exponential backoff
    const maxRetries = 3;
    let n8nResponse: Response;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 N8N webhook attempt ${attempt}/${maxRetries} to ${N8N_WEBHOOK_URL}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        // Use POST method with JSON body instead of GET with query params
        n8nResponse = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Supabase-Edge-Function/1.0',
          },
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log(`📨 N8N Response status (attempt ${attempt}):`, n8nResponse.status);
        console.log(`📨 N8N Response headers (attempt ${attempt}):`, Object.fromEntries(n8nResponse.headers.entries()));
        
        // If we get a response, break out of retry loop
        break;
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        lastError = fetchError;
        console.error(`❌ N8N fetch error (attempt ${attempt}):`, fetchError);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to call N8N webhook after ${maxRetries} attempts: ${fetchError.message}`);
        }
        
        // Exponential backoff delay
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    let responseData: any = { success: true };
    let responseText = '';
    
    try {
      // Try to parse response if it's JSON
      responseText = await n8nResponse.text();
      console.log('📨 N8N Response body:', responseText);
      
      if (responseText) {
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.log('ℹ️ N8N response was not JSON:', responseText);
          responseData = { success: true, rawResponse: responseText };
        }
      }
    } catch (textError) {
      console.error('❌ Error reading N8N response:', textError);
    }

    if (!n8nResponse.ok) {
      let errorMessage = `N8N webhook failed with status: ${n8nResponse.status}`;
      
      // Provide specific guidance for common errors
      if (n8nResponse.status === 404) {
        errorMessage += '. The webhook endpoint is not available - this usually means the n8n workflow is in test mode and needs to be reactivated or switched to production mode.';
      } else if (n8nResponse.status === 500) {
        errorMessage += '. Internal server error in n8n workflow - check the workflow configuration.';
      } else if (n8nResponse.status === 403) {
        errorMessage += '. Access forbidden - check webhook authentication settings.';
      }
      
      errorMessage += ` Response: ${responseText}`;
      throw new Error(errorMessage);
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