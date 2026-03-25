

## Plan: Improve `browserless-scrape` Edge Function

### Changes to `supabase/functions/browserless-scrape/index.ts`

**1. Fix Gloria URL** (line 37)
- Change `gloriahotels.co` → `gloriahotels.com`

**2. Add stealth headers for Marriott WAF bypass** (lines 108-118)
- Add `userAgent` with a real Chrome UA string
- Add `setExtraHTTPHeaders` with realistic browser headers (`Accept-Language`, `Referer`, etc.)
- These go inside the Browserless `/content` request body

**3. Improve Accor price extraction** (inside `extractPricesFromHTML`)
- Add Accor-specific patterns: `best-price`, `data-price`, `"value":\s*[\d.]+`, and class-based selectors like `price--value`
- Add pattern for prices shown as just digits near currency context (e.g., `class="price">\s*(\d+)`)

**4. Add hotel-specific extraction functions**
- Create `extractAccorPrices(html)` that targets Accor's DOM patterns (`booking-engine-best-price`, `data-totalPrice`, JSON-LD pricing)
- Create `extractMarriottPrices(html)` targeting Marriott's `t-price`, `rate-amount` patterns
- Call the appropriate extractor based on the `hotel` parameter, falling back to the generic extractor

**5. Return raw HTML snippet count for debugging**
- Add `htmlLength` and `priceSnippetCount` to the response for easier debugging

### Technical Details
- Stealth UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`
- Extra headers: `Accept-Language: en-US,en;q=0.9`, `Accept: text/html,...`, `Sec-Fetch-Site: none`, `Sec-Fetch-Mode: navigate`
- The hotel-specific extractors will be tried first; if they return no results, the generic extractor runs as fallback

