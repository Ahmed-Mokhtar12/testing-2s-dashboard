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

    const { url, waitForSelector, waitTime = 10000, useUnblock = true } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🌐 Browserless scraping: ${url} (${useUnblock ? '/unblock' : '/content'})`);

    if (useUnblock) {
      // Use /unblock API to bypass bot detection
      const unblockUrl = `https://production-sfo.browserless.io/unblock?token=${apiKey}&proxy=residential&timeout=60000`;

      const response = await fetch(unblockUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          content: true,
          cookies: true,
          screenshot: false,
          browserWSEndpoint: false,
          ttl: 30000,
          waitForTimeout: waitTime,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Browserless /unblock error ${response.status}: ${errText}`);
        return new Response(JSON.stringify({ error: `Browserless /unblock error: ${response.status}`, details: errText }), {
          status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await response.json();
      const html = data.content || '';
      console.log(`✅ /unblock got ${html.length} chars of HTML`);

      // Strip scripts/styles and extract text
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return new Response(JSON.stringify({
        success: true,
        html: html.substring(0, 50000),
        text: text.substring(0, 30000),
        length: html.length,
        cookies: data.cookies || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      // Fallback: /content endpoint
      const contentUrl = `https://production-sfo.browserless.io/content?token=${apiKey}`;

      const body: Record<string, unknown> = {
        url,
        waitForTimeout: waitTime,
        bestAttempt: true,
        gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
      };

      if (waitForSelector) {
        body.waitForSelector = { selector: waitForSelector, timeout: waitTime };
      }

      const response = await fetch(contentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Browserless /content error ${response.status}: ${errText}`);
        return new Response(JSON.stringify({ error: `Browserless /content error: ${response.status}`, details: errText }), {
          status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const html = await response.text();
      console.log(`✅ /content got ${html.length} chars of HTML`);

      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return new Response(JSON.stringify({
        success: true,
        html: html.substring(0, 50000),
        text: text.substring(0, 30000),
        length: html.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('❌ Browserless scrape error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
