import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
/** Extract price-relevant content from HTML, stripping scripts/styles but keeping price data */
function extractPriceContent(html: string): string {
  // First strip scripts and styles
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Extract all lines/sections that contain price-related keywords
  const priceKeywords = /AED|USD|EUR|GBP|SAR|price|rate|total|amount|per\s*night|room.*type|from\s+\d|₹|€|\$|£|درهم/i;
  const sections: string[] = [];
  
  // Split by major HTML sections and keep price-relevant ones
  const parts = clean.split(/<(?:div|section|tr|li|span|p|td|h[1-6])[^>]*>/i);
  for (const part of parts) {
    const text = part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 3 && text.length < 500 && priceKeywords.test(text)) {
      sections.push(text);
    }
  }
  
  // Also do a full text extraction as backup
  const fullText = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (sections.length > 0) {
    return sections.join('\n') + '\n---FULL---\n' + fullText;
  }
  return fullText;
}


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

      // Extract price-relevant text only (much smaller than full HTML)
      const priceText = extractPriceContent(html);

      return new Response(JSON.stringify({
        success: true,
        html: html.substring(0, 200000),
        text: priceText.substring(0, 50000),
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

      const priceText = extractPriceContent(html);

      return new Response(JSON.stringify({
        success: true,
        html: html.substring(0, 200000),
        text: priceText.substring(0, 50000),
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
