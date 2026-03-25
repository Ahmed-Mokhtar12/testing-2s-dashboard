export interface NightlyRate {
  date: string;
  dayOfWeek: string;
  rates: RoomRate[];
}

export interface RoomRate {
  roomType: string;
  price: number;
  currency: string;
  originalText?: string;
}

export interface RateResult {
  success: boolean;
  checkIn: string;
  checkOut: string;
  nights: number;
  hotelName: string;
  nightlyBreakdown: NightlyRate[];
  error?: string;
}

const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_AR: Record<string, string> = {
  Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت'
};

// Approximate exchange rates to AED
const TO_AED: Record<string, number> = {
  AED: 1, USD: 3.67, EUR: 4.0, GBP: 4.65, SAR: 0.98, QAR: 1.01, BHD: 9.74, OMR: 9.54, KWD: 11.95
};

// Dubai hotel taxes: ~10% municipality + 10% service + 5% VAT + tourism fee ≈ 21%
const DUBAI_HOTEL_TAX_MULTIPLIER = 1.21;

function convertToAED(price: number, currency: string): number {
  const rate = TO_AED[currency] || 1;
  return Math.round(price * rate * 100) / 100;
}

/** Remove estimated taxes and round to nearest 5 AED */
function toBasePriceAED(taxInclusiveAED: number): number {
  const base = taxInclusiveAED / DUBAI_HOTEL_TAX_MULTIPLIER;
  return Math.round(base / 5) * 5;
}

/** Check if scraped markdown indicates taxes are included */
function detectTaxesIncluded(markdown: string): boolean {
  const lower = markdown.toLowerCase();
  return lower.includes('taxes and fees included') ||
    lower.includes('tax included') ||
    lower.includes('includes taxes') ||
    lower.includes('toutes taxes comprises') ||
    lower.includes('ttc');
}

export class RateScraper {

  /**
   * Scrape hotel rates for a date range using Firecrawl.
   * For per-night breakdown, we scrape each 1-night stay individually.
   */
  async scrapeRates(
    checkInDate: string,
    nights: number,
    hotelUrl: string = 'https://www.2seasonshotels.com/book/accommodations'
  ): Promise<RateResult> {
    console.log(`💰 Scraping rates: ${checkInDate} for ${nights} nights from ${hotelUrl}`);

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return { success: false, checkIn: checkInDate, checkOut: '', nights, hotelName: '', nightlyBreakdown: [], error: 'FIRECRAWL_API_KEY not configured' };
    }

    const isTwoSeasons = hotelUrl.includes('2seasonshotels');
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + nights);

    if (isTwoSeasons) {
      // Two Seasons: scrape calendar view once (shows per-day rates)
      return this.scrapeTwoSeasonsRates(firecrawlKey, checkInDate, nights, hotelUrl, checkIn, checkOut);
    } else {
      // Competitor sites: scrape each night individually for per-night breakdown
      return this.scrapeCompetitorRates(firecrawlKey, checkInDate, nights, hotelUrl, checkIn, checkOut);
    }
  }

  private async scrapeTwoSeasonsRates(
    apiKey: string, checkInDate: string, nights: number, hotelUrl: string, checkIn: Date, checkOut: Date
  ): Promise<RateResult> {
    const url = this.buildBookingUrl(hotelUrl, checkInDate, this.formatDate(checkOut));
    try {
      const markdown = await this.callFirecrawl(apiKey, url);
      const calendarRates = this.extractCalendarRates(markdown, checkIn, nights);
      
      if (calendarRates.length > 0) {
        return { success: true, checkIn: checkInDate, checkOut: this.formatDate(checkOut), nights, hotelName: 'Two Seasons Hotel', nightlyBreakdown: calendarRates };
      }

      // Fallback
      const rates = this.extractRatesFromMarkdown(markdown);
      const nightlyBreakdown = this.buildNightlyFromFlat(checkIn, nights, rates);
      return { success: true, checkIn: checkInDate, checkOut: this.formatDate(checkOut), nights, hotelName: 'Two Seasons Hotel', nightlyBreakdown };
    } catch (err) {
      console.error('❌ Two Seasons rate scraping failed:', err.message);
      return { success: false, checkIn: checkInDate, checkOut: this.formatDate(checkOut), nights, hotelName: 'Two Seasons Hotel', nightlyBreakdown: [], error: err.message };
    }
  }

  /** Detect if a URL needs Browserless (SPA-heavy booking engines) */
  private needsBrowserless(url: string): boolean {
    return url.includes('rotana.com') || 
           url.includes('marriott.com') || 
           url.includes('hyatt.com');
  }

  private async scrapeCompetitorRates(
    apiKey: string, checkInDate: string, nights: number, hotelUrl: string, checkIn: Date, checkOut: Date
  ): Promise<RateResult> {
    const hotelName = this.extractHotelName(hotelUrl);
    const nightlyBreakdown: NightlyRate[] = [];
    const useBrowserless = this.needsBrowserless(hotelUrl);

    for (let i = 0; i < nights; i++) {
      const nightCheckIn = new Date(checkIn);
      nightCheckIn.setDate(checkIn.getDate() + i);
      const nightCheckOut = new Date(nightCheckIn);
      nightCheckOut.setDate(nightCheckIn.getDate() + 1);

      const ciStr = this.formatDate(nightCheckIn);
      const coStr = this.formatDate(nightCheckOut);
      const dayName = DAY_NAMES_EN[nightCheckIn.getDay()];

      console.log(`  📅 Night ${i + 1}: ${ciStr} → ${coStr} (${dayName}) [${useBrowserless ? 'Browserless' : 'Firecrawl'}]`);

      try {
        const url = this.buildBookingUrl(hotelUrl, ciStr, coStr);
        let markdown: string;

        if (useBrowserless) {
          markdown = await this.callBrowserless(url);
        } else {
          markdown = await this.callFirecrawl(apiKey, url);
        }

        const taxesIncluded = detectTaxesIncluded(markdown);
        const rates = this.extractRatesFromMarkdown(markdown);
        const aedRates = rates.map(r => {
          let priceAED = r.currency === 'AED' ? r.price : convertToAED(r.price, r.currency);
          if (taxesIncluded || r.currency !== 'AED') {
            priceAED = toBasePriceAED(priceAED);
          }
          return { ...r, price: priceAED, currency: 'AED' };
        });

        nightlyBreakdown.push({
          date: ciStr,
          dayOfWeek: dayName,
          rates: aedRates.length > 0 ? aedRates : [{ roomType: 'Room', price: 0, currency: 'AED', originalText: 'Price not found' }]
        });
      } catch (err) {
        console.error(`  ❌ Failed night ${i + 1}:`, err.message);
        nightlyBreakdown.push({
          date: ciStr,
          dayOfWeek: dayName,
          rates: [{ roomType: 'Room', price: 0, currency: 'AED', originalText: `Error: ${err.message}` }]
        });
      }
    }

    return { success: true, checkIn: checkInDate, checkOut: this.formatDate(checkOut), nights, hotelName, nightlyBreakdown };
  }

  private buildNightlyFromFlat(checkIn: Date, nights: number, rates: RoomRate[]): NightlyRate[] {
    const breakdown: NightlyRate[] = [];
    for (let i = 0; i < nights; i++) {
      const nightDate = new Date(checkIn);
      nightDate.setDate(checkIn.getDate() + i);
      breakdown.push({
        date: this.formatDate(nightDate),
        dayOfWeek: DAY_NAMES_EN[nightDate.getDay()],
        rates: rates.length > 0 ? rates : [{ roomType: 'Lowest Available Rate', price: 0, currency: 'AED', originalText: 'Price not found' }]
      });
    }
    return breakdown;
  }

  /**
   * Extract rates from the booking calendar view.
   * The calendar markdown shows patterns like: "21AED 47522AED 47523AED 475"
   * where day number is followed by "AED XXX" for each day.
   */
  private extractCalendarRates(markdown: string, checkIn: Date, nights: number): NightlyRate[] {
    console.log('📅 Extracting calendar rates...');
    
    // The calendar markdown concatenates entries like: "1AED 4752AED 4753AED 475"
    // This means: day1=AED 475, day2=AED 475, day3=AED 475
    // The price is followed immediately by the next day number without separator.
    // We use a lookahead to stop the price before the next dayAED pattern.
    const calendarPattern = /(\d{1,2})(AED|USD|EUR)\s+(\d+?)(?=\d{1,2}(?:AED|USD|EUR)\s|\s*$|\n|[a-zA-Z])/g;
    const dayPrices = new Map<number, number>();
    let currency = 'AED';
    
    let match;
    while ((match = calendarPattern.exec(markdown)) !== null) {
      const day = parseInt(match[1]);
      currency = match[2].toUpperCase();
      const price = parseFloat(match[3].replace(/,/g, ''));
      if (day >= 1 && day <= 31 && price > 50 && price < 100000) {
        // Only set if not already found (keep first occurrence per day which is the lowest rate month)
        if (!dayPrices.has(day)) {
          dayPrices.set(day, price);
          console.log(`  📅 Day ${day}: ${price} ${currency}`);
        }
      }
    }
    
    // If lookahead approach didn't work well, try a simpler split approach
    if (dayPrices.size < 5) {
      console.log('  🔄 Trying alternative calendar parsing...');
      dayPrices.clear();
      
      // Split by AED/USD/EUR and parse pairs
      const parts = markdown.split(/(AED|USD|EUR)\s+/i);
      for (let i = 0; i < parts.length - 2; i += 2) {
        // parts[i] ends with the day number, parts[i+1] is currency, parts[i+2] starts with price
        const dayMatch = parts[i].match(/(\d{1,2})$/);
        if (!dayMatch) continue;
        
        const day = parseInt(dayMatch[1]);
        currency = (parts[i + 1] || 'AED').toUpperCase();
        const priceMatch = parts[i + 2].match(/^(\d+)/);
        if (!priceMatch) continue;
        
        const price = parseInt(priceMatch[1]);
        if (day >= 1 && day <= 31 && price >= 50 && price < 100000) {
          if (!dayPrices.has(day)) {
            dayPrices.set(day, price);
            console.log(`  📅 [alt] Day ${day}: ${price} ${currency}`);
          }
        }
      }
    }

    console.log(`  Found ${dayPrices.size} calendar day prices`);

    if (dayPrices.size === 0) return [];

    const results: NightlyRate[] = [];
    for (let i = 0; i < nights; i++) {
      const nightDate = new Date(checkIn);
      nightDate.setDate(checkIn.getDate() + i);
      const day = nightDate.getDate();
      const dayName = DAY_NAMES_EN[nightDate.getDay()];
      const price = dayPrices.get(day) || 0;

      results.push({
        date: this.formatDate(nightDate),
        dayOfWeek: dayName,
        rates: [{
          roomType: 'Lowest Available Rate',
          price,
          currency,
          originalText: price > 0 ? `Calendar rate for day ${day}` : 'Not found in calendar'
        }]
      });
    }

    return results;
  }

  private buildBookingUrl(baseUrl: string, checkIn: string, checkOut: string): string {
    // Accor uses dateIn/dateOut, compositions, and nights params
    if (baseUrl.includes('accor.com') || baseUrl.includes('swissotel')) {
      const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}dateIn=${checkIn}&dateOut=${checkOut}&compositions=1&nights=${nights}`;
    }
    // Rotana uses YYYYMMDD format (no dashes)
    if (baseUrl.includes('rotana.com')) {
      const ciCompact = checkIn.replace(/-/g, '');
      const coCompact = checkOut.replace(/-/g, '');
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}checkin=${ciCompact}&checkout=${coCompact}&rooms=1&adults_1=2`;
    }
    // Marriott
    if (baseUrl.includes('marriott.com')) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}fromDate=${checkIn}&toDate=${checkOut}`;
    }
    // Hyatt
    if (baseUrl.includes('hyatt.com')) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}checkinDate=${checkIn}&checkoutDate=${checkOut}&adults=2&rooms=1`;
    }
    // IHG (Crowne Plaza etc.)
    if (baseUrl.includes('ihg.com')) {
      // IHG uses DD/MM/YYYY format
      const [y1, m1, d1] = checkIn.split('-');
      const [y2, m2, d2] = checkOut.split('-');
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}qDateIn=${d1}/${m1}/${y1}&qDateOut=${d2}/${m2}/${y2}`;
    }
    // Millennium
    if (baseUrl.includes('millenniumhotels.com')) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}checkin=${checkIn}&checkout=${checkOut}`;
    }
    // Default: checkin/checkout params
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}checkin=${checkIn}&checkout=${checkOut}`;
  }

  private async callFirecrawl(apiKey: string, url: string): Promise<string> {
    console.log(`  🔥 Firecrawl scraping: ${url}`);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 8000,
        location: { country: 'AE', languages: ['en'] }, // Force UAE locale for AED prices
      }),
    });

    if (!response.ok) {
      const errData = await response.text();
      throw new Error(`Firecrawl API error ${response.status}: ${errData}`);
    }

    const data = await response.json();
    const markdown = data?.data?.markdown || data?.markdown || '';
    
    if (!markdown) {
      throw new Error('No markdown content returned from Firecrawl');
    }

    console.log(`  ✅ Got ${markdown.length} chars of markdown`);
    return markdown;
  }

  /** Call Browserless.io /content API for SPA-heavy sites */
  private async callBrowserless(url: string): Promise<string> {
    console.log(`  🌐 Browserless scraping: ${url}`);

    const apiKey = Deno.env.get('BROWSERLESS_API_KEY');
    if (!apiKey) throw new Error('BROWSERLESS_API_KEY not configured');

    const browserlessUrl = `https://production-sfo.browserless.io/content?token=${apiKey}`;

    const body: Record<string, unknown> = {
      url,
      waitForTimeout: 12000,
      bestAttempt: true,
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: 30000,
      },
    };

    // Add wait selectors for known booking engines
    if (url.includes('rotana.com')) {
      body.waitForSelector = { selector: '.room-rate, .price, [class*="rate"], [class*="price"]', timeout: 15000 };
    } else if (url.includes('marriott.com')) {
      body.waitForSelector = { selector: '[class*="rate"], [class*="price"], .t-price', timeout: 15000 };
    } else if (url.includes('hyatt.com')) {
      body.waitForSelector = { selector: '[class*="rate"], [class*="price"], .rate-amount', timeout: 15000 };
    }

    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Browserless API error ${response.status}: ${errText}`);
    }

    const html = await response.text();
    console.log(`  ✅ Browserless got ${html.length} chars of HTML`);

    // Convert HTML to text for rate extraction
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }


  private extractRatesFromMarkdown(markdown: string): RoomRate[] {
    const rates: RoomRate[] = [];

    // Strategy 1: Accor-style "From AED XX.XX" or "From €XX.XX" with ### Room Name headers
    const accorPattern = /###\s*(.+?)[\n\r][\s\S]*?From\s+(?:AED|USD|EUR|[€$£])\s*([\d,.]+)/g;
    let accorMatch;
    while ((accorMatch = accorPattern.exec(markdown)) !== null) {
      const roomType = accorMatch[1].trim();
      const price = parseFloat(accorMatch[2].replace(/,/g, ''));
      if (price > 0 && price < 100000) {
        // Detect currency - check the matched text for currency
        const matchedText = markdown.substring(accorMatch.index, accorMatch.index + accorMatch[0].length);
        let currency = 'AED'; // Default to AED
        if (matchedText.includes('EUR') || matchedText.includes('€')) currency = 'EUR';
        else if (matchedText.includes('USD') || matchedText.includes('$')) currency = 'USD';
        else if (matchedText.includes('GBP') || matchedText.includes('£')) currency = 'GBP';
        else if (matchedText.includes('AED')) currency = 'AED';
        rates.push({ roomType, price, currency, originalText: accorMatch[0].substring(0, 100) });
      }
    }

    if (rates.length > 0) {
      // Deduplicate and keep cheapest per room type
      const uniqueRates = new Map<string, RoomRate>();
      for (const rate of rates) {
        const key = rate.roomType.toLowerCase();
        if (!uniqueRates.has(key) || uniqueRates.get(key)!.price > rate.price) {
          uniqueRates.set(key, rate);
        }
      }
      // Return only the lowest price across all room types
      const allRates = Array.from(uniqueRates.values());
      allRates.sort((a, b) => a.price - b.price);
      return [allRates[0]]; // Lowest only
    }

    // Strategy 2: Generic patterns (AED/USD/EUR price patterns)
    const pricePatterns = [
      /(?:AED|USD|EUR|SAR|QAR|BHD|OMR|KWD)\s*(\d[\d,]*(?:\.\d{2})?)/gi,
      /(\d[\d,]*(?:\.\d{2})?)\s*(?:AED|USD|EUR|SAR|QAR|BHD|OMR|KWD)/gi,
      /(?:from|starting)\s*:?\s*(?:AED|USD|EUR)?\s*(\d[\d,]*(?:\.\d{2})?)/gi,
    ];

    const lines = markdown.split('\n');
    let currentRoomType = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const roomTypeMatch = trimmed.match(/^#+\s*(.+)|^\*\*(.+?)\*\*|^((?:Standard|Deluxe|Superior|Executive|Suite|Premium|Classic|Family|Twin|Double|Single|King|Queen|Studio|Junior|Presidential|Royal|Club|Business|Economy|Luxury|Prestige|Apartment).+)/i);
      if (roomTypeMatch) {
        currentRoomType = (roomTypeMatch[1] || roomTypeMatch[2] || roomTypeMatch[3]).trim();
      }

      for (const pattern of pricePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(trimmed)) !== null) {
          const priceStr = match[1].replace(/,/g, '');
          const price = parseFloat(priceStr);
          if (price > 10 && price < 100000) {
            const currMatch = trimmed.match(/AED|USD|EUR|SAR|QAR|BHD|OMR|KWD/i);
            const currency = currMatch ? currMatch[0].toUpperCase() : 'AED';
            rates.push({ roomType: currentRoomType || 'Room', price, currency, originalText: trimmed.substring(0, 100) });
          }
        }
      }
    }

    // Return only the single lowest price
    if (rates.length === 0) return [];
    rates.sort((a, b) => a.price - b.price);
    return [rates[0]];
  }

  private formatDate(date: Date): string {
    return date.toISOString().substring(0, 10);
  }

  private extractHotelName(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes('2seasonshotels')) return 'Two Seasons Hotel';
      if (hostname.includes('accor.com')) {
        const codeMatch = url.match(/hotel\/([A-Z0-9]+)/i);
        return codeMatch ? `Accor Hotel (${codeMatch[1]})` : 'Accor Hotel';
      }
      if (hostname.includes('millenniumhotels.com')) return 'Millennium Place Barsha Heights';
      return hostname.replace('www.', '').split('.')[0];
    } catch {
      return 'Hotel';
    }
  }

  /**
   * Format rate results into a readable message for the AI to present
   */
  static formatRateResults(result: RateResult): string {
    if (!result.success) {
      return `⚠️ لم أتمكن من سحب الأسعار: ${result.error}`;
    }

    if (result.nightlyBreakdown.length === 0) {
      return `⚠️ لم يتم العثور على أسعار للفترة المطلوبة.`;
    }

    let output = `🏨 أسعار ${result.hotelName}\n`;
    output += `📅 من ${result.checkIn} إلى ${result.checkOut} (${result.nights} ${result.nights === 1 ? 'ليلة' : 'ليالي'})\n\n`;

    // Show lowest price per night only
    output += `💰 **أقل سعر متاح:**\n`;
    let total = 0;
    let currency = 'AED';

    for (const night of result.nightlyBreakdown) {
      const dayAr = DAY_NAMES_AR[night.dayOfWeek] || night.dayOfWeek;
      // Get the lowest rate for this night
      const lowestRate = night.rates.reduce((min, r) => (r.price > 0 && (min.price === 0 || r.price < min.price)) ? r : min, night.rates[0]);
      
      if (lowestRate && lowestRate.price > 0) {
        output += `  • ليلة ${night.date} (${dayAr}): ${lowestRate.price} ${lowestRate.currency}\n`;
        total += lowestRate.price;
        currency = lowestRate.currency;
      } else {
        output += `  • ليلة ${night.date} (${dayAr}): غير متوفر\n`;
      }
    }

    if (total > 0) {
      output += `\n  **الإجمالي: ${total.toLocaleString()} ${currency}**\n`;
    }

    output += `\n📍 المصدر: الموقع الرسمي\n`;
    output += `💡 ملاحظة: السعر الأساسي تقريبي (بدون ضرائب ورسوم)\n`;
    output += `⏰ تم السحب: ${new Date().toISOString().substring(0, 19).replace('T', ' ')} UTC`;

    return output;
  }
}
