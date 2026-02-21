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

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + nights);

    // Scrape the booking page calendar — it shows per-day rates in the calendar view
    const url = this.buildBookingUrl(hotelUrl, checkInDate, this.formatDate(checkOut));
    
    try {
      const markdown = await this.callFirecrawl(firecrawlKey, url);
      
      // Extract calendar-based rates (the calendar shows daily rates for each day)
      const calendarRates = this.extractCalendarRates(markdown, checkIn, nights);
      
      if (calendarRates.length > 0) {
        return {
          success: true,
          checkIn: checkInDate,
          checkOut: this.formatDate(checkOut),
          nights,
          hotelName: this.extractHotelName(hotelUrl),
          nightlyBreakdown: calendarRates
        };
      }

      // Fallback: try extracting from room listing
      const nightlyBreakdown: NightlyRate[] = [];
      const rates = this.extractRatesFromMarkdown(markdown);
      
      for (let i = 0; i < nights; i++) {
        const nightDate = new Date(checkIn);
        nightDate.setDate(checkIn.getDate() + i);
        const dayName = DAY_NAMES_EN[nightDate.getDay()];
        
        nightlyBreakdown.push({
          date: this.formatDate(nightDate),
          dayOfWeek: dayName,
          rates: rates.length > 0 ? rates : [{ roomType: 'Lowest Available Rate', price: 0, currency: 'AED', originalText: 'Price not found' }]
        });
      }

      return {
        success: true,
        checkIn: checkInDate,
        checkOut: this.formatDate(checkOut),
        nights,
        hotelName: this.extractHotelName(hotelUrl),
        nightlyBreakdown
      };
    } catch (err) {
      console.error('❌ Rate scraping failed:', err.message);
      return { success: false, checkIn: checkInDate, checkOut: this.formatDate(checkOut), nights, hotelName: this.extractHotelName(hotelUrl), nightlyBreakdown: [], error: err.message };
    }
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
    // Most booking engines accept check-in/check-out as query params
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
        waitFor: 8000, // Wait for JS-rendered prices
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

  private extractRatesFromMarkdown(markdown: string): RoomRate[] {
    const rates: RoomRate[] = [];

    // Common patterns for hotel rate pages:
    // \"Standard Room ... AED 350\" or \"350 AED\" or \"$350\" or \"AED350\"
    const pricePatterns = [
      /(?:AED|USD|EUR|SAR|QAR|BHD|OMR|KWD)\s*(\d[\d,]*(?:\.\d{2})?)/gi,
      /(\d[\d,]*(?:\.\d{2})?)\s*(?:AED|USD|EUR|SAR|QAR|BHD|OMR|KWD)/gi,
      /(?:price|rate|from|starting)\s*:?\s*(?:AED|USD|EUR)?\s*(\d[\d,]*(?:\.\d{2})?)/gi,
    ];

    // Try to find room type + price pairs
    const lines = markdown.split('\n');
    let currentRoomType = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect room type headers
      const roomTypeMatch = trimmed.match(/^#+\s*(.+)|^\*\*(.+?)\*\*|^((?:Standard|Deluxe|Superior|Executive|Suite|Premium|Classic|Family|Twin|Double|Single|King|Queen|Studio|Junior|Presidential|Royal|Club|Business|Economy|Luxury).+)/i);
      if (roomTypeMatch) {
        currentRoomType = (roomTypeMatch[1] || roomTypeMatch[2] || roomTypeMatch[3]).trim();
      }

      // Extract prices from current line
      for (const pattern of pricePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(trimmed)) !== null) {
          const priceStr = match[1].replace(/,/g, '');
          const price = parseFloat(priceStr);
          if (price > 0 && price < 100000) {
            // Detect currency
            const currMatch = trimmed.match(/AED|USD|EUR|SAR|QAR|BHD|OMR|KWD/i);
            const currency = currMatch ? currMatch[0].toUpperCase() : 'AED';

            rates.push({
              roomType: currentRoomType || 'Room',
              price,
              currency,
              originalText: trimmed.substring(0, 100)
            });
          }
        }
      }
    }

    // Deduplicate by room type (keep cheapest per type)
    const uniqueRates = new Map<string, RoomRate>();
    for (const rate of rates) {
      const key = rate.roomType.toLowerCase();
      if (!uniqueRates.has(key) || uniqueRates.get(key)!.price > rate.price) {
        uniqueRates.set(key, rate);
      }
    }

    return uniqueRates.size > 0 ? Array.from(uniqueRates.values()) : rates.slice(0, 10);
  }

  private formatDate(date: Date): string {
    return date.toISOString().substring(0, 10);
  }

  private extractHotelName(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes('2seasonshotels')) return 'Two Seasons Hotel';
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

    // Collect all room types across nights
    const allRoomTypes = new Set<string>();
    result.nightlyBreakdown.forEach(n => n.rates.forEach(r => allRoomTypes.add(r.roomType)));

    if (allRoomTypes.size === 0) {
      output += `⚠️ لم يتم العثور على أسعار محددة في صفحة الحجز.\n`;
      output += `💡 يُنصح بزيارة الموقع مباشرة أو الاتصال بالفندق.\n`;
      return output;
    }

    for (const roomType of allRoomTypes) {
      output += `🛏️ **${roomType}**:\n`;
      let total = 0;
      let currency = 'AED';

      for (const night of result.nightlyBreakdown) {
        const dayAr = DAY_NAMES_AR[night.dayOfWeek] || night.dayOfWeek;
        const rate = night.rates.find(r => r.roomType === roomType);
        if (rate && rate.price > 0) {
          output += `  • ليلة ${night.date} (${dayAr}): ${rate.price} ${rate.currency}\n`;
          total += rate.price;
          currency = rate.currency;
        } else {
          output += `  • ليلة ${night.date} (${dayAr}): غير متوفر\n`;
        }
      }

      if (total > 0) {
        output += `  **الإجمالي: ${total.toLocaleString()} ${currency}**\n`;
      }
      output += `\n`;
    }

    output += `📍 المصدر: الموقع الرسمي\n`;
    output += `⏰ تم السحب: ${new Date().toISOString().substring(0, 19).replace('T', ' ')} UTC`;

    return output;
  }
}
