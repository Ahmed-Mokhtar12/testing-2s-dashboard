export class WebScraper {
  
  async scrapeHotelWebsite(url: string = 'https://www.2seasonshotels.com'): Promise<string> {
    console.log('🕷️ Scraping hotel website:', url);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HotelBot/1.0; +https://2seasonshotels.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log('✅ Successfully fetched website content');
      
      // Extract meaningful content from HTML
      const extractedContent = this.extractHotelContent(html);
      
      return extractedContent;
      
    } catch (error) {
      console.error('❌ Website scraping failed:', error);
      throw new Error(`Failed to scrape website: ${error.message}`);
    }
  }

  private extractHotelContent(html: string): string {
    console.log('📝 Extracting content from HTML...');
    
    // Remove script and style tags
    let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Extract text content, preserving structure
    content = content.replace(/<[^>]+>/g, ' ');
    
    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    // Look for key sections about amenities
    const amenityKeywords = [
      'pool', 'swimming', 'gym', 'fitness', 'spa', 'wellness', 'massage',
      'restaurant', 'dining', 'bar', 'amenities', 'facilities', 'services',
      'room', 'suite', 'accommodation', 'wifi', 'parking', 'breakfast',
      'meeting', 'conference', 'event', 'business center'
    ];
    
    const sentences = content.split(/[.!?]+/);
    const relevantSentences: string[] = [];
    
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (amenityKeywords.some(keyword => lowerSentence.includes(keyword))) {
        relevantSentences.push(sentence.trim());
      }
    });
    
    if (relevantSentences.length === 0) {
      // If no specific amenity content found, return a summary of the first part
      return content.substring(0, 2000) + '...';
    }
    
    const extractedContent = relevantSentences.slice(0, 20).join('. ') + '.';
    
    console.log('✅ Extracted relevant hotel content');
    return extractedContent;
  }

  async scrapeSpecificPage(path: string): Promise<string> {
    const baseUrl = 'https://www.2seasonshotels.com';
    const fullUrl = path.startsWith('http') ? path : `${baseUrl}${path}`;
    
    return this.scrapeHotelWebsite(fullUrl);
  }

  formatScrapedContent(content: string, source: string): string {
    return `🌐 Website Content from ${source}:

${content}

📍 Source: ${source}
⏰ Retrieved: ${new Date().toISOString()}

Note: This information was directly extracted from the hotel's official website for the most current details.`;
  }
}