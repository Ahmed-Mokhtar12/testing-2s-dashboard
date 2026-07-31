// VENDORED from the deployed function (slug: firecrawl-scrape, version: 37) on 2026-07-31.
// Recovered because the March revert left this function deployed with no repo
// source. Reviewed on 2026-07-31 and is now the source of truth for this
// function. Security fixes (2026-07-31), in two steps:
//   1. verify_jwt = true at the gateway (no code change) — no anonymous callers.
//   2. the caller-supplied `url` is now checked against a fixed host allowlist
//      (./url-allowlist.ts) instead of being fetched as given, so an
//      authenticated caller can no longer aim the account's Firecrawl key at an
//      arbitrary target. The old competitor-rates workstream this function
//      served is retired; nothing in this repo has ever called it.

import { resolveScrapeUrl } from './url-allowlist.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, options } = await req.json();

    // Allowlist check BEFORE anything else touches the key or the network.
    const target = resolveScrapeUrl(url);
    if (!target.ok) {
      return new Response(
        JSON.stringify({ success: false, error: target.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The validated, parsed URL — not the raw input. Scheme-prefixing for bare
    // hosts moved into resolveScrapeUrl so the check and the fetch cannot drift.
    const formattedUrl = target.url;

    console.log('Scraping URL:', formattedUrl);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: options?.formats || ['markdown'],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor || 0,
        location: options?.location,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape successful');
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
