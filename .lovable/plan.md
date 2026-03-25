

# Plan: Add Browserless.io for SPA Hotel Scraping

## Overview
Add Browserless.io as a headless browser service to scrape prices from hotel websites that Firecrawl can't handle (Rotana, Marriott/Sheraton, Hyatt).

## Step 1: Get Your Browserless.io API Key
1. Go to [browserless.io](https://www.browserless.io/)
2. Sign up for an account (they have a free tier)
3. Go to your dashboard and copy your **API Key**
4. Come back here and I'll securely store it as `BROWSERLESS_API_KEY`

## Step 2: Create `browserless-scrape` Edge Function
A new Supabase Edge Function that uses Browserless.io's `/content` or `/scrape` API to:
- Launch a headless Chrome browser
- Navigate to the hotel booking page with dates
- Wait for JavaScript rendering (prices to appear)
- Extract the page content with prices visible

## Step 3: Update `rate-scraper.ts`
- Add Browserless as fallback when Firecrawl returns no prices
- Use it specifically for Rotana, Marriott, and Hyatt domains

## Step 4: Run the scrape for all 6 hotels
- Gloria & IHG → Firecrawl (already working)
- Rotana, Sheraton, Hyatt → Browserless
- Accor/Swissôtel → Firecrawl (already supported)

---

**Next step**: Please get your API key from browserless.io and share it here so I can store it securely and build the Edge Function.

