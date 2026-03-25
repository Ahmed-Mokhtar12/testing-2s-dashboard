

## Plan: Add SerpApi Secret and Build Google Hotels Scraping Function

### Step 1: Add SERPAPI_API_KEY secret
Use the add_secret tool to request the SerpApi API key from the user.

### Step 2: Create `serpapi-hotels` Edge Function
New file: `supabase/functions/serpapi-hotels/index.ts`

This function will use SerpApi's Google Hotels engine to fetch structured pricing data for all 6 hotels.

**Request format:**
```json
{
  "hotels": ["khalidiya-palace", "crowne-plaza-deira", ...],
  "checkIn": "2026-03-25",
  "checkOut": "2026-03-26"
}
```
Or single hotel mode:
```json
{
  "hotel": "khalidiya-palace",
  "checkIn": "2026-03-25",
  "checkOut": "2026-03-26"
}
```

**Hotel mapping** (name → SerpApi Google Hotels query):

| Key | SerpApi Query | Location |
|:---|:---|:---|
| `khalidiya-palace` | `Khalidiya Palace Rayhaan by Rotana Abu Dhabi` | Abu Dhabi |
| `crowne-plaza-deira` | `Crowne Plaza Dubai Deira` | Dubai |
| `al-bandar-rotana` | `Al Bandar Rotana Dubai` | Dubai |
| `sheraton-creek` | `Sheraton Dubai Creek Hotel & Towers` | Dubai |
| `hyatt-place-rigga` | `Hyatt Place Dubai Al Rigga` | Dubai |
| `swissotel-ghurair` | `Swissotel Al Ghurair Dubai` | Dubai |

**SerpApi call**: `GET https://serpapi.com/search.json?engine=google_hotels&q={query}&check_in_date={ci}&check_out_date={co}&currency=AED&adults=2&api_key={key}`

**Response parsing**: Extract from SerpApi JSON response:
- `properties[].name` — hotel name
- `properties[].rate_per_night.lowest` — lowest nightly rate (string like "AED 350")
- `properties[].total_rate.lowest` — total rate
- `properties[].type` — room type

**Batch mode**: When `hotels` array is provided, run all queries in parallel via `Promise.allSettled` and return combined results.

**Output format:**
```json
{
  "success": true,
  "results": [
    {
      "hotel": "khalidiya-palace",
      "hotelName": "Khalidiya Palace Rayhaan by Rotana",
      "checkIn": "2026-03-25",
      "checkOut": "2026-03-26",
      "lowestPrice": 350,
      "currency": "AED",
      "allPrices": [...],
      "source": "google_hotels"
    }
  ]
}
```

### Step 3: Deploy and test
Deploy the function and invoke it with a test request for all 6 hotels for March 25-26.

### Files
- **Create**: `supabase/functions/serpapi-hotels/index.ts`
- **Secret**: `SERPAPI_API_KEY`

