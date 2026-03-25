const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapeRequest {
  hotel: 'marriott' | 'accor' | 'gloria' | 'rotana' | 'ihg' | 'hyatt';
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;   // YYYY-MM-DD
  hotelCode?: string; // e.g. Accor hotel ID, Marriott property code
  url?: string;       // Direct URL override
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

// Hotel-specific scraping configurations
const HOTEL_CONFIGS: Record<string, {
  buildUrl: (checkIn: string, checkOut: string, code?: string) => string;
  priceSelector: string;
  roomSelector: string;
  waitSelector: string;
  extractScript: string;
}> = {
  marriott: {
    buildUrl: (ci, co, code) => {
      const propCode = code || 'DXBSI'; // Sheraton Dubai Creek default
      return `https://www.marriott.com/reservation/rateListMenu.mi?propertyCode=${propCode}&arrival=${ci}&departure=${co}&adults=2&children=0&rooms=1`;
    },
    priceSelector: '[data-testid="rate-amount"], .rate-amount, .t-price, .m-price-lockup, [class*="price"], [class*="rate"]',
    roomSelector: '.room-type-name, .t-room-name, [class*="room-name"], [class*="roomType"]',
    waitSelector: '[data-testid="rate-amount"], .rate-amount, .t-price, [class*="price"]',
    extractScript: `
      () => {
        const prices = [];
        // Try multiple selectors for Marriott's dynamic pricing
        const priceEls = document.querySelectorAll('[data-testid="rate-amount"], .rate-amount, .t-price, .m-price-lockup__actual-price, [class*="nightly-price"], .l-rate-grid .t-font-xl');
        const roomEls = document.querySelectorAll('.room-type-name, .t-room-name, [class*="room-name"], .l-room-type h3');
        
        priceEls.forEach((el, i) => {
          const text = el.textContent.trim();
          const match = text.match(/([A-Z]{3})?\\s*([\\d,]+\\.?\\d*)/);
          if (match) {
            const price = parseFloat(match[2].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              const roomEl = roomEls[i] || roomEls[0];
              prices.push({
                price,
                currency: match[1] || 'AED',
                roomType: roomEl ? roomEl.textContent.trim() : 'Room'
              });
            }
          }
        });
        
        // Fallback: scan all text for AED prices
        if (prices.length === 0) {
          const bodyText = document.body.innerText;
          const aedMatches = bodyText.matchAll(/(?:AED|د\\.إ)\\s*([\\d,]+)/g);
          for (const m of aedMatches) {
            const price = parseFloat(m[1].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              prices.push({ price, currency: 'AED', roomType: 'Room' });
            }
          }
        }
        
        return prices;
      }
    `
  },
  accor: {
    buildUrl: (ci, co, code) => {
      const hotelId = code || 'A8V6';
      return `https://all.accor.com/hotel/${hotelId}/index.en.shtml?dateIn=${ci}&dateOut=${co}&compositions=1&stayplus=false`;
    },
    priceSelector: '[data-testid="price"], .price, .booking-price, [class*="price"]',
    roomSelector: '.room-name, [class*="room-title"], [class*="room-name"]',
    waitSelector: '[data-testid="price"], .price, [class*="price"], .booking-price',
    extractScript: `
      () => {
        const prices = [];
        // Accor uses "From AED XXX" or "From €XXX" patterns
        const priceEls = document.querySelectorAll('[data-testid="price"], .price, [class*="price"], [class*="rate"], .booking-engine__price');
        const roomEls = document.querySelectorAll('.room-name, [class*="room-title"], [class*="room-name"], h3');
        
        priceEls.forEach((el, i) => {
          const text = el.textContent.trim();
          const match = text.match(/(?:AED|EUR|USD|€|\\$)?\\s*([\\d,]+\\.?\\d*)/);
          if (match) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 30 && price < 50000) {
              let currency = 'AED';
              if (text.includes('EUR') || text.includes('€')) currency = 'EUR';
              else if (text.includes('USD') || text.includes('$')) currency = 'USD';
              const roomEl = roomEls[Math.min(i, roomEls.length - 1)];
              prices.push({
                price,
                currency,
                roomType: roomEl ? roomEl.textContent.trim().substring(0, 80) : 'Room'
              });
            }
          }
        });
        
        // Fallback: scan body text
        if (prices.length === 0) {
          const bodyText = document.body.innerText;
          const matches = bodyText.matchAll(/(?:From\\s+)?(?:AED|EUR|€)\\s*([\\d,]+)/gi);
          for (const m of matches) {
            const price = parseFloat(m[1].replace(/,/g, ''));
            if (price > 30 && price < 50000) {
              prices.push({ price, currency: bodyText.includes('EUR') || bodyText.includes('€') ? 'EUR' : 'AED', roomType: 'Room' });
            }
          }
        }
        
        return prices;
      }
    `
  },
  gloria: {
    buildUrl: (ci, co) => {
      return `https://www.gloriahotels.co/khalidiya-palace-rayhaan/rooms-and-rates?checkIn=${ci}&checkOut=${co}&adults=2&children=0&rooms=1`;
    },
    priceSelector: '.price, .room-price, [class*="price"], [class*="rate"]',
    roomSelector: '.room-name, .room-title, [class*="room-name"], [class*="room-title"]',
    waitSelector: '.price, [class*="price"], [class*="rate"]',
    extractScript: `
      () => {
        const prices = [];
        const priceEls = document.querySelectorAll('.price, .room-price, [class*="price"], [class*="rate"], [class*="amount"]');
        const roomEls = document.querySelectorAll('.room-name, .room-title, [class*="room-name"], h3, h2');
        
        priceEls.forEach((el, i) => {
          const text = el.textContent.trim();
          const match = text.match(/(?:AED|USD)?\\s*([\\d,]+\\.?\\d*)/);
          if (match) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              const roomEl = roomEls[Math.min(i, roomEls.length - 1)];
              prices.push({
                price,
                currency: 'AED',
                roomType: roomEl ? roomEl.textContent.trim().substring(0, 80) : 'Room'
              });
            }
          }
        });
        
        if (prices.length === 0) {
          const bodyText = document.body.innerText;
          const matches = bodyText.matchAll(/AED\\s*([\\d,]+)/g);
          for (const m of matches) {
            const price = parseFloat(m[1].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              prices.push({ price, currency: 'AED', roomType: 'Room' });
            }
          }
        }
        
        return prices;
      }
    `
  },
  rotana: {
    buildUrl: (ci, co, code) => {
      const hotel = code || 'al-bandar-rotana';
      return `https://www.rotana.com/rotanahotelandresorts/${hotel}?checkin=${ci}&checkout=${co}&adults=2&children=0&rooms=1`;
    },
    priceSelector: '.price, [class*="price"], [class*="rate"], [class*="amount"]',
    roomSelector: '.room-name, [class*="room-name"], [class*="room-title"], h3',
    waitSelector: '.price, [class*="price"], [class*="rate"]',
    extractScript: `
      () => {
        const prices = [];
        const priceEls = document.querySelectorAll('.price, [class*="price"], [class*="rate"], [class*="amount"], .room-card__price');
        const roomEls = document.querySelectorAll('.room-name, [class*="room-name"], [class*="room-title"], .room-card__title, h3');
        
        priceEls.forEach((el, i) => {
          const text = el.textContent.trim();
          const match = text.match(/(?:AED|USD)?\\s*([\\d,]+\\.?\\d*)/);
          if (match) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              const roomEl = roomEls[Math.min(i, roomEls.length - 1)];
              prices.push({
                price,
                currency: 'AED',
                roomType: roomEl ? roomEl.textContent.trim().substring(0, 80) : 'Room'
              });
            }
          }
        });
        
        if (prices.length === 0) {
          const bodyText = document.body.innerText;
          const matches = bodyText.matchAll(/AED\\s*([\\d,]+)/g);
          for (const m of matches) {
            const price = parseFloat(m[1].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              prices.push({ price, currency: 'AED', roomType: 'Room' });
            }
          }
        }
        
        return prices;
      }
    `
  },
  ihg: {
    buildUrl: (ci, co, code) => {
      const hotelCode = code || 'DXBCP'; // Crowne Plaza Deira
      return `https://www.ihg.com/crowneplaza/hotels/ae/en/dubai/${hotelCode}/hoteldetail/select-roomrate?fromRedirect=true&qSrt=sBR&qSlH=${hotelCode}&qRms=1&qAdlt=2&qChld=0&qCiD=${ci.split('-')[2]}&qCiMy=${ci.substring(0,7).replace('-','')}&qCoD=${co.split('-')[2]}&qCoMy=${co.substring(0,7).replace('-','')}&setPMCookies=true&qSHBr498=11499&qDest=Dubai&srb_u=1`;
    },
    priceSelector: '[data-testid="price"], .price, [class*="price"], [class*="rate"]',
    roomSelector: '.room-name, [class*="room-name"], [class*="room-type"]',
    waitSelector: '[class*="price"], [class*="rate"]',
    extractScript: `
      () => {
        const prices = [];
        const bodyText = document.body.innerText;
        const matches = bodyText.matchAll(/(?:AED|USD|\\$)\\s*([\\d,]+\\.?\\d*)/g);
        for (const m of matches) {
          const price = parseFloat(m[1].replace(/,/g, ''));
          if (price > 50 && price < 50000) {
            prices.push({ price, currency: 'AED', roomType: 'Room' });
          }
        }
        return prices;
      }
    `
  },
  hyatt: {
    buildUrl: (ci, co, code) => {
      const hotelCode = code || 'dubai';
      return `https://www.hyatt.com/shop/rooms/${hotelCode}?location=${hotelCode}&checkinDate=${ci}&checkoutDate=${co}&rooms=1&adults=2&kids=0`;
    },
    priceSelector: '[data-testid="price"], .price, [class*="price"], [class*="nightly-rate"]',
    roomSelector: '.room-name, [class*="room-name"], [class*="room-title"]',
    waitSelector: '[class*="price"], [class*="rate"]',
    extractScript: `
      () => {
        const prices = [];
        const bodyText = document.body.innerText;
        const matches = bodyText.matchAll(/(?:AED|USD|\\$)\\s*([\\d,]+\\.?\\d*)/g);
        for (const m of matches) {
          const price = parseFloat(m[1].replace(/,/g, ''));
          if (price > 50 && price < 50000) {
            prices.push({ price, currency: 'AED', roomType: 'Room' });
          }
        }
        return prices;
      }
    `
  }
};

// Exchange rates to AED
const TO_AED: Record<string, number> = {
  AED: 1, USD: 3.67, EUR: 4.0, GBP: 4.65, SAR: 0.98
};

function convertToAED(price: number, currency: string): number {
  const rate = TO_AED[currency] || 1;
  return Math.round(price * rate);
}

async function scrapeWithBrowserless(
  apiKey: string,
  url: string,
  config: typeof HOTEL_CONFIGS[string]
): Promise<{ prices: { price: number; currency: string; roomType: string }[]; html?: string }> {
  
  console.log(`🌐 Browserless scraping: ${url}`);

  // Use Browserless /function endpoint to run JS in the page context
  const functionBody = `
    module.exports = async ({ page }) => {
      // Set viewport and user agent for desktop
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set geolocation to UAE
      await page.setGeolocation({ latitude: 25.2048, longitude: 55.2708 });
      
      // Navigate with extended timeout
      await page.goto('${url}', { 
        waitUntil: 'networkidle2', 
        timeout: 45000 
      });
      
      // Wait for price elements to load
      try {
        await page.waitForSelector('${config.waitSelector}', { timeout: 20000 });
      } catch(e) {
        console.log('Wait selector timeout, continuing...');
      }
      
      // Extra wait for JS rendering
      await new Promise(r => setTimeout(r, 5000));
      
      // Extract prices using the hotel-specific script
      const prices = await page.evaluate(${config.extractScript});
      
      // Also get the full page text as fallback
      const bodyText = await page.evaluate(() => document.body.innerText);
      
      return { prices, bodyText: bodyText.substring(0, 10000) };
    };
  `;

  const response = await fetch(`https://chrome.browserless.io/function?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: functionBody,
      context: {}
    }),
  });

  if (!response.ok) {
    // Try the /scrape endpoint as fallback
    console.log('Function endpoint failed, trying /scrape...');
    return await scrapeWithBrowserlessScrape(apiKey, url, config);
  }

  const result = await response.json();
  console.log(`✅ Browserless returned ${result.prices?.length || 0} prices`);
  
  return { prices: result.prices || [] };
}

async function scrapeWithBrowserlessScrape(
  apiKey: string,
  url: string,
  config: typeof HOTEL_CONFIGS[string]
): Promise<{ prices: { price: number; currency: string; roomType: string }[] }> {
  
  console.log(`🔄 Trying Browserless /scrape endpoint...`);
  
  const response = await fetch(`https://chrome.browserless.io/scrape?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      waitForSelector: { selector: config.waitSelector, timeout: 20000 },
      gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 },
      elements: [
        { selector: config.priceSelector },
        { selector: config.roomSelector }
      ]
    }),
  });

  if (!response.ok) {
    // Final fallback: /content endpoint for raw HTML
    console.log('Scrape endpoint failed, trying /content...');
    return await scrapeWithBrowserlessContent(apiKey, url);
  }

  const data = await response.json();
  const prices: { price: number; currency: string; roomType: string }[] = [];
  
  if (data.data) {
    for (const el of data.data) {
      if (el.results) {
        for (const r of el.results) {
          const text = r.text || '';
          const match = text.match(/(?:AED|EUR|USD|€|\$)?\s*([\d,]+\.?\d*)/);
          if (match) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 50 && price < 50000) {
              let currency = 'AED';
              if (text.includes('EUR') || text.includes('€')) currency = 'EUR';
              else if (text.includes('USD') || text.includes('$')) currency = 'USD';
              prices.push({ price, currency, roomType: 'Room' });
            }
          }
        }
      }
    }
  }
  
  return { prices };
}

async function scrapeWithBrowserlessContent(
  apiKey: string,
  url: string
): Promise<{ prices: { price: number; currency: string; roomType: string }[] }> {
  
  console.log(`📄 Trying Browserless /content endpoint...`);
  
  const response = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Browserless content failed: ${response.status}`);
  }

  const html = await response.text();
  const prices: { price: number; currency: string; roomType: string }[] = [];
  
  // Extract AED prices from HTML
  const aedMatches = html.matchAll(/(?:AED|د\.إ)\s*([\d,]+)/g);
  for (const m of aedMatches) {
    const price = parseFloat(m[1].replace(/,/g, ''));
    if (price > 50 && price < 50000) {
      prices.push({ price, currency: 'AED', roomType: 'Room' });
    }
  }
  
  // EUR prices
  const eurMatches = html.matchAll(/(?:EUR|€)\s*([\d,]+)/g);
  for (const m of eurMatches) {
    const price = parseFloat(m[1].replace(/,/g, ''));
    if (price > 30 && price < 50000) {
      prices.push({ price, currency: 'EUR', roomType: 'Room' });
    }
  }
  
  return { prices };
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

    const config = HOTEL_CONFIGS[hotel];
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown hotel brand: ${hotel}. Supported: ${Object.keys(HOTEL_CONFIGS).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetUrl = directUrl || config.buildUrl(checkIn, checkOut, hotelCode);
    console.log(`🏨 Scraping ${hotel}: ${targetUrl}`);

    const { prices } = await scrapeWithBrowserless(apiKey, targetUrl, config);

    // Convert all prices to AED
    const aedPrices = prices.map(p => ({
      ...p,
      price: p.currency !== 'AED' ? convertToAED(p.price, p.currency) : p.price,
      currency: 'AED'
    }));

    // Deduplicate and sort
    const uniquePrices = Array.from(
      new Map(aedPrices.map(p => [`${p.price}-${p.roomType}`, p])).values()
    ).sort((a, b) => a.price - b.price);

    const lowest = uniquePrices.find(p => p.price > 0) || null;

    const result: ScrapeResult = {
      success: true,
      hotel,
      checkIn,
      checkOut,
      lowestPrice: lowest?.price || null,
      currency: 'AED',
      roomType: lowest?.roomType || 'N/A',
      allPrices: uniquePrices,
      scrapedAt: new Date().toISOString()
    };

    console.log(`✅ ${hotel}: lowest = ${result.lowestPrice} AED`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Browserless scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
