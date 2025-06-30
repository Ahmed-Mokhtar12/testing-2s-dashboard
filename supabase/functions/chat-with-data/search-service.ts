
export class SearchService {
  private googleApiKey: string;
  private searchEngineId: string;

  constructor() {
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    const engineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
    
    if (!apiKey || !engineId) {
      throw new Error('Google Search API key or Search Engine ID not configured');
    }
    
    this.googleApiKey = apiKey;
    this.searchEngineId = engineId;
  }

  async searchWeb(query: string, numResults: number = 5): Promise<any[]> {
    console.log('🔍 Searching the web for:', query);
    
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.searchEngineId}&q=${encodeURIComponent(query)}&num=${numResults}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Google Search API Error:', response.status, errorText);
        throw new Error(`Google Search API Error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        console.log('📭 No search results found for:', query);
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
      
    } catch (error) {
      console.error('❌ Search error:', error);
      throw error;
    }
  }

  getCurrentDateTime(): string {
    const now = new Date();
    return now.toISOString();
  }

  formatSearchResults(results: any[], query: string): string {
    if (results.length === 0) {
      return `No search results found for "${query}".`;
    }

    let formatted = `🔍 Search Results for "${query}" (${results.length} results):\n\n`;
    
    results.forEach((result, index) => {
      formatted += `${index + 1}. **${result.title}**\n`;
      formatted += `   ${result.snippet}\n`;
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
    
    switch (functionName) {
      case 'search_web':
        const results = await this.searchWeb(args.query, args.num_results || 5);
        return this.formatSearchResults(results, args.query);
        
      case 'get_current_datetime':
        const currentTime = this.getCurrentDateTime();
        return `Current date and time: ${currentTime}`;
        
      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }
}
