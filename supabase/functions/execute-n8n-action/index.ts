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

const N8N_WEBHOOK_URL = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL');

if (!N8N_WEBHOOK_URL) {
  console.error('🚨 Missing N8N configuration: N8N_WHATSAPP_WEBHOOK_URL not set');
}

// Generate HMAC-SHA256 signature for webhook request authentication
async function generateHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function executeActionViaN8N(actionRequest: ActionRequest): Promise<any> {
  const webhookUrl = N8N_WEBHOOK_URL!;

  const workflowData = {
    actionType: actionRequest.type,
    recipient: actionRequest.recipient,
    phoneNumber: actionRequest.phoneNumber,
    subject: actionRequest.subject || 'Message from Two Seasons Hotel AI',
    message: actionRequest.message,
    messageId: actionRequest.messageId,
    timestamp: new Date().toISOString()
  };

  const payload = JSON.stringify(workflowData);
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

  // Add HMAC signature if secret is configured
  const webhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
  if (webhookSecret) {
    const signature = await generateHmacSignature(payload, webhookSecret);
    requestHeaders['X-Webhook-Signature'] = `sha256=${signature}`;
    requestHeaders['X-Timestamp'] = new Date().toISOString();
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: requestHeaders,
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`n8n webhook execution failed with status ${response.status}: ${errorText}`);
  }

  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    return { message: responseText, status: 'success' };
  }
}

// Email regex for validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s]{7,20}$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const actionRequest: ActionRequest = await req.json();

    // Input validation
    if (!actionRequest.type || !['email', 'sms', 'whatsapp'].includes(actionRequest.type)) {
      return new Response(
        JSON.stringify({ success: false, error: 'type must be one of: email, sms, whatsapp' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!actionRequest.message || typeof actionRequest.message !== 'string' || actionRequest.message.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (actionRequest.message.length > 4096) {
      return new Response(
        JSON.stringify({ success: false, error: 'message must not exceed 4096 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!actionRequest.messageId || typeof actionRequest.messageId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'messageId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (actionRequest.type === 'email' && actionRequest.recipient && !EMAIL_REGEX.test(actionRequest.recipient)) {
      return new Response(
        JSON.stringify({ success: false, error: 'recipient must be a valid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if ((actionRequest.type === 'sms' || actionRequest.type === 'whatsapp') && actionRequest.phoneNumber && !PHONE_REGEX.test(actionRequest.phoneNumber)) {
      return new Response(
        JSON.stringify({ success: false, error: 'phoneNumber format is invalid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute with retry
    const maxRetries = 3;
    let workflowResult: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        workflowResult = await executeActionViaN8N(actionRequest);
        break;
      } catch (workflowError) {
        console.error(`❌ n8n workflow error (attempt ${attempt}):`, workflowError);
        if (attempt === maxRetries) {
          throw new Error(`Failed to execute n8n workflow after ${maxRetries} attempts: ${workflowError.message}`);
        }
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      actionType: actionRequest.type,
      messageId: actionRequest.messageId,
      timestamp: new Date().toISOString(),
      workflowResult,
      message: `${actionRequest.type} action executed successfully via n8n workflow`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Error in N8N workflow action executor:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
