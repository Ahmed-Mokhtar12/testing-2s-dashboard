const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapeRequest {
  hotel: string;
  checkIn: string;
  checkOut: string;
  hotelCode?: string;
  url?: string;
}

interface ScrapeResult {
  success: boolean;
  hotel: string;
  checkIn: string;
  checkOut: string;
  lowestPrice: number | null;
  currency: string;
  roomType: string;
  allPrices: { price: number; currency: string; roomType: string }[];
  scrapedAt: string;
  error?: string;
}

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
    `https://www.gloriahotels.co/khalidiya-palace-rayhaan/rooms-and-rates?checkIn=${ci}&checkOut=${co}&adults=2&children=0&rooms=1`,
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

function extractPricesFromHTML(html: string): { price: number; currency: string; roomType: string }[] {
  const prices: { price: number; currency: string; roomType: string }[] = [];
  const seen = new Set<number>();

  // AED prices
  const aedPatterns = [
    /(?:AED|د\.إ)\s*([\d,]+(?:\.\d{2})?)/g,
    /(?:AED|د\.إ)<[^>]*>([\d,]+)/g,
    /data-price="([\d.]+)"/g,
    /"price":\s*([\d.]+)/g,
    /"amount":\s*([\d.]+)/g,
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

  // EUR prices (Accor often shows EUR)
  for (const m of html.matchAll(/(?:EUR|€)\s*([\d,]+(?:\.\d{2})?)/g)) {
    const price = parseFloat(m[1].replace(/,/g, ''));
    const aed = Math.round(price * TO_AED.EUR);
    if (price > 30 && price < 50000 && !seen.has(aed)) {
      seen.add(aed);
      prices.push({ price: aed, currency: 'AED', roomType: 'Room' });
    }
  }

  // USD prices
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

async function scrapeWithBrowserless(apiKey: string, url: string): Promise<string> {
  console.log(`🌐 Browserless /content: ${url}`);

  // Use /content endpoint - returns fully rendered HTML after JS execution
  const response = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      gotoOptions: {
        waitUntil: 'networkidle0',
        timeout: 50000,
      },
      waitForTimeout: 15000, // Wait 15s for SPA to render prices
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`❌ Browserless error ${response.status}: ${errText.substring(0, 500)}`);
    throw new Error(`Browserless failed: ${response.status}`);
  }

  const html = await response.text();
  console.log(`✅ Got ${html.length} chars of rendered HTML`);
  return html;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    const { hotel, checkIn, checkOut, hotelCode, url: directUrl } = body;

    if (!hotel || !checkIn || !checkOut) {
      return new Response(
        JSON.stringify({ success: false, error: 'hotel, checkIn, checkOut are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const urlBuilder = HOTEL_URLS[hotel];
    if (!urlBuilder && !directUrl) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown hotel: ${hotel}. Use: ${Object.keys(HOTEL_URLS).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetUrl = directUrl || urlBuilder(checkIn, checkOut, hotelCode);
    console.log(`🏨 Scraping ${hotel}: ${targetUrl}`);

    const html = await scrapeWithBrowserless(apiKey, targetUrl);
    const prices = extractPricesFromHTML(html);

    // Filter out common non-price numbers (deposits, review scores, etc.)
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
