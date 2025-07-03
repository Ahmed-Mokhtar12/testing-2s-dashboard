
import { WebScraper } from './web-scraper.ts';

export class SearchService {
  private googleApiKey: string;
  private searchEngineId: string;
  private webScraper: WebScraper;

  constructor() {
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    const engineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
    
    if (!apiKey || !engineId) {
      console.error('❌ Missing Google Search credentials:', { hasApiKey: !!apiKey, hasEngineId: !!engineId });
      throw new Error('Google Search API key or Search Engine ID not configured');
    }
    
    // Validate API key format
    if (!apiKey.startsWith('AIza')) {
      console.error('❌ Invalid Google API key format');
      throw new Error('Invalid Google API key format');
    }
    
    this.googleApiKey = apiKey;
    this.searchEngineId = engineId;
    this.webScraper = new WebScraper();
    
    console.log('✅ SearchService initialized successfully');
  }

  async searchWeb(query: string, numResults: number = 5): Promise<any[]> {
    console.log('🔍 Searching the web for:', query);
    
    // Try multiple search strategies for Two Seasons Hotel
    const searchStrategies = this.getSearchStrategies(query);
    
    // For Two Seasons Hotel queries, try web scraping first
    if (this.isTwoSeasonsQuery(query)) {
      console.log('🏨 Two Seasons Hotel query detected, trying web scraping first...');
      try {
        const scrapedContent = await this.webScraper.scrapeHotelWebsite();
        if (scrapedContent && scrapedContent.length > 100) {
          console.log('✅ Successfully scraped hotel website content');
          return [{
            title: 'Two Seasons Hotel - Official Website',
            snippet: scrapedContent.substring(0, 300) + '...',
            link: 'https://www.2seasonshotels.com',
            displayLink: '2seasonshotels.com',
            fullContent: scrapedContent
          }];
        }
      } catch (scrapeError) {
        console.log('⚠️ Web scraping failed, falling back to search API:', scrapeError.message);
      }
    }
    
    // Fallback to Google Search API
    for (let i = 0; i < searchStrategies.length; i++) {
      const strategy = searchStrategies[i];
      console.log(`🎯 Trying search strategy ${i + 1}/${searchStrategies.length}:`, strategy.description);
      
      try {
        const results = await this.executeSearch(strategy.query, numResults);
        if (results.length > 0) {
          console.log(`✅ Success with strategy: ${strategy.description}`);
          return results;
        }
        console.log(`📭 No results with strategy: ${strategy.description}`);
      } catch (error) {
        console.error(`❌ Strategy ${i + 1} failed:`, error.message);
        if (i === searchStrategies.length - 1) {
          throw error; // Re-throw if all strategies failed
        }
      }
    }
    
    console.log('📭 All search strategies failed');
    return [];
  }

  private isTwoSeasonsQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return lowerQuery.includes('site:2seasonshotels.com') || 
           lowerQuery.includes('two seasons') || 
           lowerQuery.includes('2seasonshotels') ||
           lowerQuery.includes('hotel amenities') ||
           lowerQuery.includes('pool') ||
           lowerQuery.includes('gym') ||
           lowerQuery.includes('spa');
  }

  private getSearchStrategies(originalQuery: string): Array<{query: string, description: string}> {
    const lowerQuery = originalQuery.toLowerCase();
    
    // If it's a Two Seasons Hotel query, use specific strategies
    if (lowerQuery.includes('site:2seasonshotels.com') || lowerQuery.includes('two seasons')) {
      return [
        { 
          query: 'site:2seasonshotels.com', 
          description: 'Direct site search' 
        },
        { 
          query: '"Two Seasons Hotel" amenities services', 
          description: 'Hotel services search' 
        },
        { 
          query: '"Two Seasons Hotel" contact booking', 
          description: 'Contact and booking search' 
        },
        { 
          query: '"Two Seasons Hotel"', 
          description: 'General hotel search' 
        },
        { 
          query: '2seasonshotels.com', 
          description: 'Domain search without site prefix' 
        }
      ];
    }
    
    // For other queries, try the original query
    return [{ query: originalQuery, description: 'Original query' }];
  }

  private async executeSearch(query: string, numResults: number): Promise<any[]> {
    const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.searchEngineId}&q=${encodeURIComponent(query)}&num=${numResults}`;
    
    console.log('🌐 API Request URL (sanitized):', url.replace(this.googleApiKey, '[API_KEY]'));
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Google Search API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      // Handle specific error types
      if (response.status === 403) {
        throw new Error('Google Search API quota exceeded or invalid credentials');
      } else if (response.status === 400) {
        throw new Error('Invalid search query or parameters');
      } else {
        throw new Error(`Google Search API Error: ${response.statusText}`);
      }
    }

    const data = await response.json();
    console.log('📊 API Response structure:', {
      hasItems: !!data.items,
      itemCount: data.items?.length || 0,
      searchInfo: data.searchInformation
    });
    
    if (!data.items || data.items.length === 0) {
      return [];
    }

    const searchResults = data.items.map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink
    }));

    console.log('✅ Found', searchResults.length, 'search results');
    return searchResults;
  }

  getCurrentDateTime(): string {
    const now = new Date();
    return now.toISOString();
  }

  formatSearchResults(results: any[], query: string): string {
    if (results.length === 0) {
      // Provide helpful fallback information for Two Seasons Hotel queries
      if (this.isTwoSeasonsQuery(query)) {
        return `🏨 Two Seasons Hotel Information:

While I couldn't find specific search results for "${query}", I can help you with general hotel information:

📞 **Contact Information:**
- For current rates and availability, please contact the hotel directly
- Visit the official website: www.2seasonshotels.com
- Call or email for immediate assistance

🏨 **Typical Hotel Services:**
- Accommodation and room bookings
- Restaurant and dining services
- Meeting and event facilities
- Guest amenities and services

📋 **For Specific Information:**
- Room types and rates: Contact hotel reservations
- Dining options: Check restaurant hours and menus
- Amenities: Pool, gym, spa services availability
- Policies: Cancellation, check-in/out times

💡 **Booking Assistance:**
I can help you send an email or message to the hotel for specific inquiries about rates, availability, or services.

Would you like me to help you contact the hotel directly?`;
      }
      
      return `No search results found for "${query}".`;
    }

    let formatted = `🔍 Search Results for "${query}" (${results.length} results):\n\n`;
    
    results.forEach((result, index) => {
      formatted += `${index + 1}. **${result.title}**\n`;
      
      // If we have full content from scraping, use it
      if (result.fullContent) {
        formatted += `   ${result.fullContent}\n`;
      } else {
        formatted += `   ${result.snippet}\n`;
      }
      
      formatted += `   Source: ${result.displayLink}\n`;
      formatted += `   Link: ${result.link}\n\n`;
    });

    return formatted;
  }

  getAvailableFunctions() {
    return [
      {
        name: "search_web",
        description: "Search the internet for current information, news, facts, or any topic. Use this when you need up-to-date information that might not be in your training data.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find information about"
            },
            num_results: {
              type: "integer",
              description: "Number of search results to return (default: 5, max: 10)",
              default: 5
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_current_datetime",
        description: "Get the current date and time. Use this when you need to know what day/time it is right now.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    console.log('🛠️ Executing function:', functionName, 'with args:', args);
    
    try {
      switch (functionName) {
        case 'search_web':
          const results = await this.searchWeb(args.query, args.num_results || 5);
          const formattedResults = this.formatSearchResults(results, args.query);
          
          // Log successful search
          console.log('✅ Search completed:', {
            query: args.query,
            resultCount: results.length,
            hasContent: formattedResults.length > 100
          });
          
          return formattedResults;
          
        case 'get_current_datetime':
          const currentTime = this.getCurrentDateTime();
          return `Current date and time: ${currentTime}`;
          
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      console.error(`❌ Function execution failed:`, {
        functionName,
        args,
        error: error.message,
        stack: error.stack
      });
      
      // For search_web failures, provide helpful fallback
      if (functionName === 'search_web') {
        return this.formatSearchResults([], args.query);
      }
      
      throw error;
    }
  }
}
