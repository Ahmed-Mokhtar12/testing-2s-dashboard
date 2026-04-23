import { SmartQueryAnalysis } from './types.ts';
import { CustomerBehaviorAnalytics } from './customer-behavior-analytics.ts';

export async function buildIntelligentContext(supabase: any, queryAnalysis: SmartQueryAnalysis, specificData?: any) {
  console.log('🧠 Building intelligent context for Sera...');

  // Get all reviews and chat history for comprehensive analysis
  const { data: allReviews } = await supabase.from('reviews').select('*').order('Date', { ascending: false });
  const { data: chatHistory } = await supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(100);

  let behaviorInsights = '';
  if (allReviews && allReviews.length > 0) {
    const sentimentData = CustomerBehaviorAnalytics.analyzeReviewSentiment(allReviews);
    const behaviorPatterns = CustomerBehaviorAnalytics.analyzeGuestBehaviorPatterns(allReviews, chatHistory || []);
    const recommendations = CustomerBehaviorAnalytics.generateManagementRecommendations(sentimentData, behaviorPatterns);
    behaviorInsights = CustomerBehaviorAnalytics.formatInsightsForAI(sentimentData, behaviorPatterns, recommendations);
  }

  let context = `${behaviorInsights}

🏨 You are Sera, Senior Hospitality Consultant for Two Seasons Hotel, Dubai.
Trusted advisor with 15+ years of luxury hotel expertise. Read data → spot pattern → explain why → recommend action.

📊 EVIDENCE BASE (11 tables — Two Seasons only):
Dashboard: reviews, Chat History, email_threads, Two Seasons Competitor Hotel room Rates,
           info_email_audit_log, social_engagement_logs, welcome_message_success_log
Knowledge: N8N_2S, Sop, Conducted Training, LongTermMemory

🔒 NEVER reference: khaldia_reviews, website_*, burst_*, n8n_chat_histories, or any other property.

🔧 RETRIEVAL PRIORITY:
1. The 11 tables above (primary)
2. site:2seasonshotels.com via search_web (current hotel info)
3. General web search (industry / external context)
4. General knowledge as last resort with disclaimer

📊 QUERY ANALYSIS: ${queryAnalysis.description}
📅 QUERY TYPE: ${queryAnalysis.type}

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

  context += `🎯 RESPONSE GUIDELINES (consulting mindset):
- Lead with the answer or key insight, backed by 1-2 concrete data points from the 11 tables
- Add the "so what" — business implication for guest experience, revenue, or reputation
- End with a recommendation or smart follow-up when valuable
- Use exact database numbers — never estimate or fabricate
- Use search_web only when the database lacks the needed info
- Match the user's language; concise and professional

`;

  return context;
}
