export class WebsiteQueryAnalyzer {
  static analyzeForWebsiteSearch(message: string): {
    needsWebsiteSearch: boolean;
    searchQueries: string[];
    category: string;
    priority: 'high' | 'medium' | 'low';
  } {
    const lowerMessage = message.toLowerCase();
    const searchQueries: string[] = [];
    let category = 'general';
    let priority: 'high' | 'medium' | 'low' = 'low';
    
    // Hotel services and amenities
    if (this.matchesCategory(lowerMessage, ['room', 'suite', 'accommodation', 'stay', 'bed'])) {
      searchQueries.push('site:2seasonshotels.com rooms accommodation suites');
      category = 'rooms';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['amenity', 'amenities', 'facility', 'facilities', 'service', 'services'])) {
      searchQueries.push('site:2seasonshotels.com amenities facilities services');
      category = 'amenities';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['restaurant', 'dining', 'food', 'menu', 'meal', 'breakfast', 'lunch', 'dinner'])) {
      searchQueries.push('site:2seasonshotels.com restaurant dining food menu');
      category = 'dining';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['spa', 'wellness', 'massage', 'treatment', 'relaxation'])) {
      searchQueries.push('site:2seasonshotels.com spa wellness massage treatment');
      category = 'spa';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['gym', 'fitness', 'pool', 'swimming', 'exercise'])) {
      searchQueries.push('site:2seasonshotels.com gym fitness pool swimming');
      category = 'fitness';
      priority = 'high';
    }
    
    // Booking and policies
    if (this.matchesCategory(lowerMessage, ['book', 'booking', 'reserve', 'reservation', 'availability'])) {
      searchQueries.push('site:2seasonshotels.com booking reservation policy');
      category = 'booking';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['price', 'rate', 'cost', 'fee', 'charge', 'payment'])) {
      searchQueries.push('site:2seasonshotels.com rates prices packages');
      category = 'pricing';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['policy', 'policies', 'cancellation', 'cancel', 'refund'])) {
      searchQueries.push('site:2seasonshotels.com policy cancellation refund');
      category = 'policies';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['check in', 'check-in', 'checkin', 'check out', 'check-out', 'checkout'])) {
      searchQueries.push('site:2seasonshotels.com check-in check-out policy');
      category = 'checkin';
      priority = 'high';
    }
    
    // Location and contact
    if (this.matchesCategory(lowerMessage, ['location', 'address', 'direction', 'directions', 'where', 'map'])) {
      searchQueries.push('site:2seasonshotels.com location address directions');
      category = 'location';
      priority = 'high';
    }
    
    if (this.matchesCategory(lowerMessage, ['contact', 'phone', 'email', 'call', 'reach'])) {
      searchQueries.push('site:2seasonshotels.com contact phone email');
      category = 'contact';
      priority = 'high';
    }
    
    // Events and meetings
    if (this.matchesCategory(lowerMessage, ['event', 'events', 'meeting', 'conference', 'wedding', 'party'])) {
      searchQueries.push('site:2seasonshotels.com events meetings conferences wedding');
      category = 'events';
      priority = 'high';
    }
    
    // Business services
    if (this.matchesCategory(lowerMessage, ['business', 'corporate', 'wifi', 'internet', 'parking'])) {
      searchQueries.push('site:2seasonshotels.com business services wifi parking');
      category = 'business';
      priority = 'high';
    }
    
    // Special offers and packages
    if (this.matchesCategory(lowerMessage, ['offer', 'offers', 'package', 'packages', 'deal', 'promotion', 'discount'])) {
      searchQueries.push('site:2seasonshotels.com offers packages deals promotion');
      category = 'offers';
      priority = 'high';
    }
    
    // If no specific category but mentions Two Seasons Hotel
    if (searchQueries.length === 0 && this.matchesCategory(lowerMessage, ['two seasons', 'hotel', 'seasonshotels'])) {
      searchQueries.push('site:2seasonshotels.com');
      category = 'general_hotel';
      priority = 'medium';
    }
    
    return {
      needsWebsiteSearch: searchQueries.length > 0,
      searchQueries,
      category,
      priority
    };
  }
  
  private static matchesCategory(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword));
  }
  
  static getSearchPriority(analysis: any): string[] {
    const priorityQueries: string[] = [];
    
    // Add specific search queries based on category
    switch (analysis.category) {
      case 'rooms':
        priorityQueries.push(
          'site:2seasonshotels.com rooms',
          'site:2seasonshotels.com accommodation',
          'site:2seasonshotels.com suites'
        );
        break;
      case 'dining':
        priorityQueries.push(
          'site:2seasonshotels.com restaurant',
          'site:2seasonshotels.com dining',
          'site:2seasonshotels.com menu'
        );
        break;
      case 'amenities':
        priorityQueries.push(
          'site:2seasonshotels.com amenities',
          'site:2seasonshotels.com facilities',
          'site:2seasonshotels.com services'
        );
        break;
      case 'booking':
        priorityQueries.push(
          'site:2seasonshotels.com booking',
          'site:2seasonshotels.com reservation',
          'site:2seasonshotels.com availability'
        );
        break;
      case 'contact':
        priorityQueries.push(
          'site:2seasonshotels.com contact',
          'site:2seasonshotels.com phone',
          'site:2seasonshotels.com email'
        );
        break;
      default:
        priorityQueries.push('site:2seasonshotels.com');
    }
    
    return priorityQueries;
  }
}