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
  
  // Get all reviews for comprehensive analytics from correct table
  const { data: allReviews, error } = await supabase
    .from('reviews')
    .select('*')
    .order('Date', { ascending: false });
    
  if (error || !allReviews) {
    return { allReviews: [], error };
  }
  
  // Calculate analytics
  const analytics = {
    totalReviews: allReviews.length,
    averageScore: 0,
    sourceBreakdown: {} as Record<string, number>,
    monthlyBreakdown: {} as Record<string, number>,
    recentTrend: 0
  };
  
  // Calculate average score
  const reviewsWithScores = allReviews.filter(r => r.Score);
  if (reviewsWithScores.length > 0) {
    analytics.averageScore = reviewsWithScores.reduce((sum, r) => sum + r.Score, 0) / reviewsWithScores.length;
  }
  
  // Source breakdown
  allReviews.forEach(review => {
    const source = review.Source || 'Unknown';
    analytics.sourceBreakdown[source] = (analytics.sourceBreakdown[source] || 0) + 1;
  });
  
  // Monthly breakdown (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  
  allReviews.forEach(review => {
    if (review.Date) {
      const monthKey = review.Date.toString().substring(0, 7); // YYYY-MM
      analytics.monthlyBreakdown[monthKey] = (analytics.monthlyBreakdown[monthKey] || 0) + 1;
    }
  });
  
  return { analytics, allReviews, error: null };
}