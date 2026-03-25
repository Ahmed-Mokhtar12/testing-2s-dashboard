

# Plan: Scrape Official Hotel Website Prices for 6 Competitors (3 Days)

## What You're Asking
Scrape the **lowest published room rate** from the **official hotel websites** (not Booking.com) for 6 hotels for the coming 3 days (March 25, 26, 27, 2026).

## The Challenge
Unlike Booking.com which has a consistent markdown structure, each hotel chain has a **different booking engine** (IHG, Marriott, Hyatt, Accor, Rotana, Gloria). These booking engines are heavily JavaScript-rendered SPAs that may not return pricing data even with Firecrawl's `waitFor`. This is fundamentally harder than Booking.com scraping.

## Hotels & URL Patterns

| # | Hotel | Booking Engine | URL Pattern |
|---|-------|---------------|-------------|
| 1 | Khalidia Palace (Gloria) | Gloria Hotels | `gloria-hotels.com` — no dynamic date params in URL |
| 2 | Al Bandar Rotana | Rotana Bookings | `bookings.rotana.com/en/reservation/roomdetails/140057?checkin=YYYYMMDD&checkout=YYYYMMDD&rooms=1&adults_1=2` |
| 3 | Crowne Plaza Deira | IHG | `ihg.com/crowneplaza/.../DXBCP/hoteldetail` — dates via form/params |
| 4 | Sheraton Dubai Creek | Marriott | `marriott.com/.../dxbsc-.../overview` — Book Now builds URL |
| 5 | Hyatt Place Al Rigga | Hyatt | `hyatt.com/.../dxbal` — dates via search widget |
| 6 | Swissôtel Al Ghurair | Accor | `all.accor.com/hotel/A5E2/index.en.shtml` — already supported in rate-scraper |

## Implementation Plan

### Step 1: Update `buildBookingUrl` in `rate-scraper.ts`
Add URL construction logic for each new booking engine:
- **Rotana**: `checkin=YYYYMMDD` format (no dashes)
- **IHG**: `qDateIn=DD/MM/YYYY&qDateOut=DD/MM/YYYY&qSlH=DXBCP`
- **Marriott**: `fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
- **Hyatt**: `checkinDate=YYYY-MM-DD&checkoutDate=YYYY-MM-DD`
- **Gloria**: May need to scrape the booking widget page with dates injected
- **Accor**: Already handled (dateIn/dateOut)

### Step 2: Update `extractRatesFromMarkdown` with provider-specific patterns
Add extraction patterns for each booking engine's markdown output:
- **Rotana**: Look for room type + price patterns specific to Rotana's layout
- **IHG**: "From AED XXX" or rate card patterns
- **Marriott**: "Starting from AED XXX" patterns
- **Hyatt**: Rate display patterns
- **Gloria**: Price display patterns

### Step 3: Update `extractHotelName` for new domains

### Step 4: Run the scrape
Execute a script that calls `firecrawl-scrape` for each hotel × each date (18 requests total), extract the lowest price, and present results in a table.

## Important Caveats
- **Gloria Hotels** may not have URL-based date injection — the booking widget might be iframe-based, which Firecrawl cannot scrape into
- **IHG, Marriott, Hyatt** booking engines are React/Angular SPAs that may block scrapers or require cookies/sessions
- If official sites don't yield prices, we can fall back to **Booking.com URLs** (which we already know work)

## Recommendation
I'll update the `rate-scraper.ts` with the new URL patterns and extraction logic, then run the scrape. For any hotel where the official site doesn't return parseable prices, I'll note which ones failed and we can decide whether to fall back to Booking.com.

