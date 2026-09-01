// VENDORED from the deployed function (slug: serpapi-hotels, version: 20) on 2026-07-31.
// Recovered because the March revert left this function deployed with no repo
// source. Reviewed on 2026-07-31 and is now the source of truth for this
// function. Security fix (2026-07-31): set verify_jwt = true at the gateway —
// the code is otherwise byte-for-byte what version 20 was running, and it needs
// no URL allowlist of its own: the SerpApi query is built server-side from the
// six-entry HOTEL_MAP below and an unknown hotel key is already a hard 400.
// The exposure that was closed was purely the anonymous-caller one (burning
// SerpApi credits), not an arbitrary-target one.

import { roleFromAuthorization } from './jwt-role.ts'; // sibling copy of _shared/jwt-role.ts, pinned by tests/unit/jwt-role-copies-agree.test.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface HotelQuery {
  key: string;
  query: string;
}

interface PriceEntry {
  price: number;
  currency: string;
  roomType: string;
  hotelName: string;
}

interface HotelResult {
  hotel: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  lowestPrice: number | null;
  currency: string;
  roomType: string;
  allPrices: PriceEntry[];
  source: string;
  error?: string;
}

const HOTEL_MAP: Record<string, string> = {
  'khalidiya-palace': 'Khalidiya Palace Rayhaan by Rotana Abu Dhabi',
  'crowne-plaza-deira': 'Crowne Plaza Dubai Deira',
  'al-bandar-rotana': 'Al Bandar Rotana Dubai',
  'sheraton-creek': 'Sheraton Dubai Creek Hotel & Towers',
  'hyatt-place-rigga': 'Hyatt Place Dubai Al Rigga',
  'swissotel-ghurair': 'Swissotel Al Ghurair Dubai',
};

function parsePrice(priceStr: string): number | null {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

async function fetchHotelPrices(
  apiKey: string,
  hotelKey: string,
  query: string,
  checkIn: string,
  checkOut: string
): Promise<HotelResult> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_hotels');
  url.searchParams.set('q', query);
  url.searchParams.set('check_in_date', checkIn);
  url.searchParams.set('check_out_date', checkOut);
  url.searchParams.set('currency', 'AED');
  url.searchParams.set('adults', '2');
  url.searchParams.set('api_key', apiKey);

  console.log(`🏨 SerpApi query for ${hotelKey}: ${query}`);

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`❌ SerpApi error for ${hotelKey}: ${resp.status} ${errText.substring(0, 300)}`);
    return {
      hotel: hotelKey, hotelName: query, checkIn, checkOut,
      lowestPrice: null, currency: 'AED', roomType: 'N/A',
      allPrices: [], source: 'google_hotels',
      error: `SerpApi ${resp.status}`,
    };
  }

  const data = await resp.json();
  const properties = data.properties || [];
  console.log(`✅ ${hotelKey}: got ${properties.length} properties from SerpApi`);

  const allPrices: PriceEntry[] = [];

  for (const prop of properties) {
    const name = prop.name || query;
    const ratePerNight = prop.rate_per_night?.lowest || prop.rate_per_night?.before_taxes_fees;
    const totalRate = prop.total_rate?.lowest || prop.total_rate?.before_taxes_fees;
    const roomType = prop.type || 'Room';

    const nightlyPrice = parsePrice(ratePerNight);
    const totalPrice = parsePrice(totalRate);

    if (nightlyPrice && nightlyPrice > 50 && nightlyPrice < 50000) {
      allPrices.push({ price: nightlyPrice, currency: 'AED', roomType, hotelName: name });
    } else if (totalPrice && totalPrice > 50 && totalPrice < 50000) {
      allPrices.push({ price: totalPrice, currency: 'AED', roomType: `${roomType} (total)`, hotelName: name });
    }
  }

  // Also check for "prices" array in some SerpApi responses
  if (data.prices) {
    for (const p of data.prices) {
      const val = parsePrice(p.rate_per_night?.lowest || p.price);
      if (val && val > 50 && val < 50000) {
        allPrices.push({ price: val, currency: 'AED', roomType: p.type || 'Room', hotelName: query });
      }
    }
  }

  allPrices.sort((a, b) => a.price - b.price);
  const lowest = allPrices.length > 0 ? allPrices[0] : null;

  console.log(`💰 ${hotelKey}: lowest = ${lowest?.price ?? 'N/A'} AED, total found = ${allPrices.length}`);

  return {
    hotel: hotelKey,
    hotelName: lowest?.hotelName || query,
    checkIn,
    checkOut,
    lowestPrice: lowest?.price || null,
    currency: 'AED',
    roomType: lowest?.roomType || 'N/A',
    allPrices: allPrices.slice(0, 10),
    source: 'google_hotels',
  };
}

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

  const apiKey = Deno.env.get('SERPAPI_API_KEY')?.trim();
  console.log(`🔑 API key length: ${apiKey?.length}, starts with: ${apiKey?.substring(0, 4)}...`);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'SERPAPI_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { hotel, hotels, checkIn, checkOut } = body;

    if (!checkIn || !checkOut) {
      return new Response(
        JSON.stringify({ success: false, error: 'checkIn and checkOut are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dates must be YYYY-MM-DD format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requested: unknown[] = Array.isArray(hotels) ? hotels : (hotel ? [hotel] : Object.keys(HOTEL_MAP));
    // Dedupe and cap: hotels[] was unbounded, so one request could fan out into N paid
    // SerpAPI calls (audit E11).
    const hotelKeys: string[] = [...new Set(requested.filter((k): k is string => typeof k === 'string'))];
    if (hotelKeys.length === 0 || hotelKeys.length > Object.keys(HOTEL_MAP).length) {
      return new Response(
        JSON.stringify({ success: false, error: `hotels must list 1..${Object.keys(HOTEL_MAP).length} known keys` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate hotel keys (Object.hasOwn: no prototype keys — audit E6)
    const invalid = hotelKeys.filter((k: string) => !Object.hasOwn(HOTEL_MAP, k));
    if (invalid.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown hotels: ${invalid.join(', ')}. Available: ${Object.keys(HOTEL_MAP).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Fetching prices for ${hotelKeys.length} hotels: ${hotelKeys.join(', ')}`);

    const results = await Promise.allSettled(
      hotelKeys.map((k: string) => fetchHotelPrices(apiKey, k, HOTEL_MAP[k], checkIn, checkOut))
    );

    const hotelResults: HotelResult[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        hotel: hotelKeys[i], hotelName: HOTEL_MAP[hotelKeys[i]],
        checkIn, checkOut, lowestPrice: null, currency: 'AED',
        roomType: 'N/A', allPrices: [], source: 'google_hotels',
        error: r.reason?.message || 'Unknown error',
      };
    });

    return new Response(
      JSON.stringify({ success: true, results: hotelResults, fetchedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
