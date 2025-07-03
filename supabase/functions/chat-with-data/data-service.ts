export async function queryReviewsByDateRange(supabase: any, startDate: string, endDate: string) {
  console.log(`📊 Querying reviews from ${startDate} to ${endDate}`);
  
  const { data: reviews, error } = await supabase
    .from('Hotel Reviews')
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
    .from('Hotel Reviews')
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
  
  // Monthly breakdown (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  allReviews.forEach(review => {
    if (review.Date && new Date(review.Date) >= sixMonthsAgo) {
      const monthKey = review.Date.substring(0, 7); // YYYY-MM
      analytics.monthlyBreakdown[monthKey] = (analytics.monthlyBreakdown[monthKey] || 0) + 1;
    }
  });
  
  return { analytics, allReviews, error: null };
}