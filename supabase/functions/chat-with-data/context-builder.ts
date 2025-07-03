import { SmartQueryAnalysis } from './types.ts';
import { CustomerBehaviorAnalytics } from './customer-behavior-analytics.ts';

export async function buildIntelligentContext(supabase: any, queryAnalysis: SmartQueryAnalysis, specificData?: any) {
  console.log('🧠 Building intelligent context with customer behavior analytics...');
  
  // Get all reviews and chat history for comprehensive analysis
  const { data: allReviews } = await supabase.from('Hotel Reviews').select('*').order('Date', { ascending: false });
  const { data: chatHistory } = await supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(100);
  
  // Generate comprehensive customer behavior insights
  let behaviorInsights = '';
  if (allReviews && allReviews.length > 0) {
    const sentimentData = CustomerBehaviorAnalytics.analyzeReviewSentiment(allReviews);
    const behaviorPatterns = CustomerBehaviorAnalytics.analyzeGuestBehaviorPatterns(allReviews, chatHistory || []);
    const recommendations = CustomerBehaviorAnalytics.generateManagementRecommendations(sentimentData, behaviorPatterns);
    behaviorInsights = CustomerBehaviorAnalytics.formatInsightsForAI(sentimentData, behaviorPatterns, recommendations);
  }
  
  let context = `${behaviorInsights}

🏨 You are Marcus Chen, Senior Hotel Management Consultant for Two Seasons Hotel with complete data access and PRIORITY website access.

⭐ PRIMARY SOURCE: www.2seasonshotels.com (ALWAYS search first for hotel information)
📊 QUERY ANALYSIS: ${queryAnalysis.description}
📅 QUERY TYPE: ${queryAnalysis.type}

🔍 MANDATORY: You MUST call search_web("site:2seasonshotels.com [topic]") function FIRST for ANY hotel-related query.
🚨 NEVER say "technical issue" or "unable to access" - ALWAYS call the search_web function!

`;

  if (specificData?.reviews) {
    const reviews = specificData.reviews;
    const reviewsWithScores = reviews.filter((r: any) => r.Score);
    const avgScore = reviewsWithScores.length > 0 ? 
      reviewsWithScores.reduce((sum: number, r: any) => sum + r.Score, 0) / reviewsWithScores.length : 0;
    
    const sourceBreakdown = reviews.reduce((acc: any, review: any) => {
      const source = review.Source || 'Unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    context += `🎯 SPECIFIC DATA FOR YOUR QUERY:
- Total reviews in period: ${reviews.length}
- Average score: ${avgScore.toFixed(1)}/5
- Date range: ${queryAnalysis.startDate} to ${queryAnalysis.endDate}
- Sources: ${Object.entries(sourceBreakdown).map(([source, count]) => `${source} (${count})`).join(', ')}

📋 SAMPLE REVIEWS FROM THIS PERIOD:
`;
    
    reviews.slice(0, 5).forEach((review: any, index: number) => {
      context += `${index + 1}. ${review.Date} - ${review.Source} - Score: ${review.Score || 'N/A'}
   ${review.Title ? `Title: ${review.Title}` : ''}
   ${review['Reviews Summary'] ? `Summary: ${review['Reviews Summary'].substring(0, 150)}...` : ''}

`;
    });
  }
  
  if (specificData?.analytics) {
    const analytics = specificData.analytics;
    context += `📈 COMPREHENSIVE HOTEL ANALYTICS:
- Total reviews in database: ${analytics.totalReviews}
- Overall average score: ${analytics.averageScore.toFixed(1)}/5
- Review sources breakdown: ${Object.entries(analytics.sourceBreakdown).map(([source, count]) => `${source} (${count})`).join(', ')}

📅 RECENT MONTHLY TRENDS:
${Object.entries(analytics.monthlyBreakdown)
  .sort(([a], [b]) => b.localeCompare(a))
  .slice(0, 6)
  .map(([month, count]) => `- ${month}: ${count} reviews`)
  .join('\n')}

`;
  }

  context += `🎯 CRITICAL WEBSITE-FIRST INSTRUCTIONS:
- 🏨 MANDATORY: You MUST call search_web("site:2seasonshotels.com [topic]") function FIRST before answering ANY hotel-related question
- ⭐ WEBSITE PRIORITY: Hotel website information is the PRIMARY source, database provides analytics
- 🔍 SEARCH REQUIREMENT: Use search_web function with "site:2seasonshotels.com [topic]" for hotel services, amenities, policies
- 🚨 NEVER SKIP: Always call search_web function for hotel queries - never provide answers without searching the website first!
- 🔄 FALLBACK: If website search fails, provide helpful information based on general hotel policies and suggest contacting the hotel directly
- 📊 RESPONSE STRUCTURE: Lead with website information, supplement with database analytics
- 💬 MESSAGING CAPABILITIES: Send emails, SMS, WhatsApp when requested
- 📞 CONTACT EXTRACTION: Extract recipient info and message content from user requests
- 📧 EMAIL FORMAT: Include relevant subject lines for email communications
- 📊 DATA PRECISION: Use exact database numbers - never estimate or approximate
- 🔄 INTEGRATION APPROACH: Website for current info + database for historical trends
- 💼 CONSULTANT ROLE: Professional, conversational, data-driven hotel advisor
- 🎯 ALWAYS PROVIDE VALUE: Even if search fails, give helpful guidance and next steps

`;

  return context;
}