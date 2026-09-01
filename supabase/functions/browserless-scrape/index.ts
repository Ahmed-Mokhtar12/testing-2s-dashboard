// VENDORED from the deployed function (slug: browserless-scrape, version: 38) on 2026-07-31.
// Recovered because the March revert left this function deployed with no repo
// source. Reviewed on 2026-07-31 and is now the source of truth for this
// function. Security fix (2026-07-31): removed the caller-supplied `url`
// bypass — the scrape target must now come from the HOTEL_URLS allowlist,
// and an unknown `hotel` is a hard 400 — and set verify_jwt = true at the
// gateway so the function can no longer be invoked anonymously.

import { roleFromAuthorization } from './jwt-role.ts'; // sibling copy of _shared/jwt-role.ts, pinned by tests/unit/jwt-role-copies-agree.test.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapeRequest {
  hotel: string;
  checkIn: string;
  checkOut: string;
  hotelCode?: string;
}

interface PriceEntry {
  price: number;
  currency: string;
  roomType: string;
}

interface ScrapeResult {
  success: boolean;
  hotel: string;
  checkIn: string;
  checkOut: string;
  lowestPrice: number | null;
  currency: string;
  roomType: string;
  allPrices: PriceEntry[];
  scrapedAt: string;
  htmlLength?: number;
  priceSnippetCount?: number;
  error?: string;
}

const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const HOTEL_URLS: Record<string, (ci: string, co: string, code?: string) => string> = {
  marriott: (ci, co, code) => {
    const prop = code || 'DXBSI';
    return `https://www.marriott.com/reservation/rateListMenu.mi?propertyCode=${prop}&arrival=${ci}&departure=${co}&adults=2&children=0&rooms=1`;
  },
  accor: (ci, co, code) => {
    const id = code || 'A8V6';
    return `https://all.accor.com/hotel/${id}/index.en.shtml?dateIn=${ci}&dateOut=${co}&compositions=1&stayplus=false`;
  },
  gloria: (ci, co) =>
    `https://www.gloriahotels.com/khalidiya-palace-rayhaan/rooms-and-rates?checkIn=${ci}&checkOut=${co}&adults=2&children=0&rooms=1`,
  rotana: (ci, co, code) => {
    const hotel = code || 'al-bandar-rotana';
    return `https://www.rotana.com/rotanahotelandresorts/${hotel}?checkin=${ci}&checkout=${co}&adults=2&children=0&rooms=1`;
  },
  ihg: (ci, co, code) => {
    const h = code || 'DXBCP';
    const [y1, m1, d1] = ci.split('-');
    const [y2, m2, d2] = co.split('-');
    return `https://www.ihg.com/crowneplaza/hotels/ae/en/dubai/${h}/hoteldetail/select-roomrate?qSrt=sBR&qSlH=${h}&qRms=1&qAdlt=2&qChld=0&qCiD=${d1}&qCiMy=${m1}${y1}&qCoD=${d2}&qCoMy=${m2}${y2}&setPMCookies=true`;
  },
  hyatt: (ci, co, code) => {
    const h = code || 'dubai';
    return `https://www.hyatt.com/shop/rooms/${h}?checkinDate=${ci}&checkoutDate=${co}&rooms=1&adults=2&kids=0`;
  },
};

const TO_AED: Record<string, number> = {
  AED: 1, USD: 3.67, EUR: 4.0, GBP: 4.65, SAR: 0.98,
};

// --- Hotel-specific extractors ---

function extractAccorPrices(html: string): PriceEntry[] {
  const prices: PriceEntry[] = [];
  const seen = new Set<number>();

  const patterns = [
    /best-price[^>]*>[\s\S]*?(\d[\d,]*(?:\.\d{2})?)\s*(?:AED|EUR|€|USD)/g,
    /data-totalPrice="(\d[\d,.]*?)"/gi,
    /data-price="(\d[\d,.]*?)"/gi,
    /price--value[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/g,
    /booking-engine-best-price[^>]*>[\s\S]*?(\d[\d,]*(?:\.\d{2})?)/g,
    /"price"\s*:\s*"?(\d[\d,.]*)"?/g,
    /"value"\s*:\s*"?(\d[\d,.]*)"?/g,
    /class="[^"]*price[^"]*"[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/gi,
  ];

  for (const pat of patterns) {
    for (const m of html.matchAll(pat)) {
      let raw = parseFloat(m[1].replace(/,/g, ''));
      // Detect EUR context
      const ctx = html.substring(Math.max(0, m.index! - 30), m.index! + m[0].length + 30);
      if (/EUR|€/.test(ctx)) raw = Math.round(raw * TO_AED.EUR);
      else if (/USD|\$/.test(ctx)) raw = Math.round(raw * TO_AED.USD);
      if (raw > 50 && raw < 50000 && !seen.has(raw)) {
        seen.add(raw);
        prices.push({ price: raw, currency: 'AED', roomType: 'Room' });
      }
    }
  }
  return prices.sort((a, b) => a.price - b.price);
}

function extractMarriottPrices(html: string): PriceEntry[] {
  const prices: PriceEntry[] = [];
  const seen = new Set<number>();

  const patterns = [
    /t-price[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/g,
    /rate-amount[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/g,
    /data-rate="(\d[\d,.]*?)"/gi,
    /lowest-price[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/g,
    /"fromPrice"\s*:\s*"?(\d[\d,.]*)"?/g,
    /"rateAmount"\s*:\s*"?(\d[\d,.]*)"?/g,
    /class="[^"]*rate[^"]*"[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/gi,
  ];

  for (const pat of patterns) {
    for (const m of html.matchAll(pat)) {
      let raw = parseFloat(m[1].replace(/,/g, ''));
      const ctx = html.substring(Math.max(0, m.index! - 30), m.index! + m[0].length + 30);
      if (/USD|\$/.test(ctx)) raw = Math.round(raw * TO_AED.USD);
      if (raw > 50 && raw < 50000 && !seen.has(raw)) {
        seen.add(raw);
        prices.push({ price: raw, currency: 'AED', roomType: 'Room' });
      }
    }
  }
  return prices.sort((a, b) => a.price - b.price);
}

// --- Generic extractor (fallback) ---

function extractPricesGeneric(html: string): PriceEntry[] {
  const prices: PriceEntry[] = [];
  const seen = new Set<number>();

  const aedPatterns = [
    /(?:AED|د\.إ)\s*([\d,]+(?:\.\d{2})?)/g,
    /(?:AED|د\.إ)<[^>]*>([\d,]+)/g,
    /data-price="([\d.]+)"/g,
    /"price":\s*([\d.]+)/g,
    /"amount":\s*([\d.]+)/g,
    /class="[^"]*price[^"]*"[^>]*>\s*(\d[\d,]*(?:\.\d{2})?)/gi,
  ];

  for (const pat of aedPatterns) {
    for (const m of html.matchAll(pat)) {
      const price = parseFloat(m[1].replace(/,/g, ''));
      if (price > 50 && price < 50000 && !seen.has(price)) {
        seen.add(price);
        prices.push({ price, currency: 'AED', roomType: 'Room' });
      }
    }
  }

  for (const m of html.matchAll(/(?:EUR|€)\s*([\d,]+(?:\.\d{2})?)/g)) {
    const price = parseFloat(m[1].replace(/,/g, ''));
    const aed = Math.round(price * TO_AED.EUR);
    if (price > 30 && price < 50000 && !seen.has(aed)) {
      seen.add(aed);
      prices.push({ price: aed, currency: 'AED', roomType: 'Room' });
    }
  }

  for (const m of html.matchAll(/(?:USD|\$)\s*([\d,]+(?:\.\d{2})?)/g)) {
    const price = parseFloat(m[1].replace(/,/g, ''));
    const aed = Math.round(price * TO_AED.USD);
    if (price > 30 && price < 50000 && !seen.has(aed)) {
      seen.add(aed);
      prices.push({ price: aed, currency: 'AED', roomType: 'Room' });
    }
  }

  return prices.sort((a, b) => a.price - b.price);
}

// --- Extract prices by hotel brand ---

function extractPrices(html: string, hotel: string): PriceEntry[] {
  const extractors: Record<string, (h: string) => PriceEntry[]> = {
    accor: extractAccorPrices,
    marriott: extractMarriottPrices,
  };

  const specific = extractors[hotel];
  if (specific) {
    const results = specific(html);
    if (results.length > 0) return results;
  }
  return extractPricesGeneric(html);
}

// --- Browserless scraper with stealth ---

async function scrapeWithBrowserless(apiKey: string, url: string): Promise<string> {
  console.log(`🌐 Browserless /content: ${url}`);

  const response = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      gotoOptions: {
        waitUntil: 'networkidle0',
        timeout: 50000,
      },
      waitForTimeout: 15000,
      setExtraHTTPHeaders: {
        'User-Agent': STEALTH_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.google.com/',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`❌ Browserless error ${response.status}: ${errText.substring(0, 500)}`);
    throw new Error(`Browserless failed: ${response.status}`);
  }

  const html = await response.text();
  console.log(`✅ Got ${html.length} chars of rendered HTML`);

  // Deep debug: extract context around best-price and currency markers
  const bestPriceIdx = html.indexOf('best-price');
  if (bestPriceIdx !== -1) {
    console.log(`🎯 best-price context: ${html.substring(bestPriceIdx, bestPriceIdx + 500)}`);
  }
  // Find all digit sequences near AED
  const aedContexts: string[] = [];
  for (const m of html.matchAll(/AED/g)) {
    aedContexts.push(html.substring(Math.max(0, m.index! - 50), m.index! + 60));
  }
  if (aedContexts.length > 0) {
    console.log(`💰 AED contexts (${aedContexts.length}): ${JSON.stringify(aedContexts.slice(0, 5))}`);
  }

  const priceSnippets: string[] = [];
  const debugPatterns = [/price/gi, /AED/g, /EUR/g, /rate/gi, /amount/gi, /tarif/gi];
  const lines = html.split('\n');
  for (const line of lines) {
    for (const pat of debugPatterns) {
      if (pat.test(line) && line.length < 500) {
        priceSnippets.push(line.trim().substring(0, 200));
        break;
      }
    }
    if (priceSnippets.length >= 20) break;
  }
  if (priceSnippets.length > 0) {
    console.log(`🔍 Price snippets (${priceSnippets.length}): ${JSON.stringify(priceSnippets.slice(0, 10))}`);
  }

  return html;
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Service-role callers only (n8n / operator). No dashboard code calls this function and
  // every request spends paid third-party credits (audit E11). verify_jwt = true makes the
  // role claim trustworthy.
  if (roleFromAuthorization(req.headers.get('Authorization')) !== 'service_role') {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('BROWSERLESS_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'BROWSERLESS_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json() as ScrapeRequest;
    const { hotel, checkIn, checkOut, hotelCode } = body;

    if (!hotel || !checkIn || !checkOut) {
      return new Response(
        JSON.stringify({ success: false, error: 'hotel, checkIn, checkOut are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Object.hasOwn: a plain-object lookup let hotel:"constructor" resolve to Object and turn
    // checkIn into the target URL (audit E6).
    const urlBuilder = Object.hasOwn(HOTEL_URLS, hotel) ? HOTEL_URLS[hotel] : undefined;
    if (!urlBuilder) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown hotel: ${hotel}. Use: ${Object.keys(HOTEL_URLS).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetUrl = urlBuilder(checkIn, checkOut, hotelCode);
    console.log(`🏨 Scraping ${hotel}: ${targetUrl}`);

    const html = await scrapeWithBrowserless(apiKey, targetUrl);
    const prices = extractPrices(html, hotel);

    const filteredPrices = prices.filter(p => {
      if (p.price === 200 || p.price === 500 || p.price === 1000) return prices.filter(x => x.price === p.price).length > 1;
      return true;
    });

    const lowest = filteredPrices.length > 0 ? filteredPrices[0] : null;

    const result: ScrapeResult = {
      success: true,
      hotel,
      checkIn,
      checkOut,
      lowestPrice: lowest?.price || null,
      currency: 'AED',
      roomType: lowest?.roomType || 'N/A',
      allPrices: filteredPrices.slice(0, 10),
      scrapedAt: new Date().toISOString(),
      htmlLength: html.length,
      priceSnippetCount: filteredPrices.length,
    };

    console.log(`✅ ${hotel}: lowest = ${result.lowestPrice} AED, total prices found: ${filteredPrices.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
