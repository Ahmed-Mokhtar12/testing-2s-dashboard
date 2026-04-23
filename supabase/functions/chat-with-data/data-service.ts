// Sera is restricted to these 11 Two Seasons tables only.
export const ALLOWED_TABLES = [
  'reviews',
  'Chat History',
  'email_threads',
  'Two Seasons Competitor Hotel room Rates',
  'info_email_audit_log',
  'social_engagement_logs',
  'welcome_message_success_log',
  'N8N_2S',
  'Sop',
  'Conducted Training',
  'LongTermMemory',
] as const;

export async function queryReviewsByDateRange(supabase: any, startDate: string, endDate: string) {
  console.log(`📊 Querying reviews from ${startDate} to ${endDate}`);

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .gte('Date', startDate)
    .lte('Date', endDate)
    .order('Date', { ascending: false });

  return { reviews, error };
}

export async function getAnalyticsData(supabase: any) {
  console.log('📈 Fetching analytics data...');

  // Get all reviews for comprehensive analytics
  const { data: allReviews, error } = await supabase
    .from('reviews')
    .select('*')
    .order('Date', { ascending: false });

  if (error || !allReviews) {
    return { allReviews: [], error };
  }

  const analytics = {
    totalReviews: allReviews.length,
    averageScore: 0,
    sourceBreakdown: {} as Record<string, number>,
    monthlyBreakdown: {} as Record<string, number>,
    recentTrend: 0,
  };

  const reviewsWithScores = allReviews.filter((r: any) => r.Score);
  if (reviewsWithScores.length > 0) {
    analytics.averageScore =
      reviewsWithScores.reduce((sum: number, r: any) => sum + r.Score, 0) /
      reviewsWithScores.length;
  }

  allReviews.forEach((review: any) => {
    const source = review.Source || 'Unknown';
    analytics.sourceBreakdown[source] = (analytics.sourceBreakdown[source] || 0) + 1;
  });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  allReviews.forEach((review: any) => {
    if (review.Date && new Date(review.Date) >= sixMonthsAgo) {
      const monthKey = review.Date.substring(0, 7); // YYYY-MM
      analytics.monthlyBreakdown[monthKey] = (analytics.monthlyBreakdown[monthKey] || 0) + 1;
    }
  });

  return { analytics, allReviews, error: null };
}
