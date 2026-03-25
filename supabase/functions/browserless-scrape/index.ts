import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BROWSERLESS_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'BROWSERLESS_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { url, waitForSelector, waitTime = 10000 } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🌐 Browserless scraping: ${url}`);
    console.log(`  ⏱️ waitTime: ${waitTime}ms, waitForSelector: ${waitForSelector || 'none'}`);

    // Use the /content endpoint to get fully rendered HTML
    const browserlessUrl = `https://production-sfo.browserless.io/content?token=${apiKey}`;

    const body: Record<string, unknown> = {
      url,
      waitForTimeout: waitTime,
      bestAttempt: true,
    };

    // Add waitForSelector if provided
    if (waitForSelector) {
      body.waitForSelector = {
        selector: waitForSelector,
        timeout: waitTime,
      };
    }

    // Add gotoOptions for better page loading
    body.gotoOptions = {
      waitUntil: 'networkidle2',
      timeout: 30000,
    };

    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Browserless error ${response.status}: ${errText}`);
      return new Response(JSON.stringify({ error: `Browserless API error: ${response.status}`, details: errText }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // /content returns HTML as text
    const html = await response.text();
    console.log(`✅ Got ${html.length} chars of HTML`);

    // Extract text content from HTML (simple approach - strip tags)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return new Response(JSON.stringify({
      success: true,
      html: html.substring(0, 50000), // Limit HTML size
      text: textContent.substring(0, 30000),
      length: html.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Browserless scrape error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
