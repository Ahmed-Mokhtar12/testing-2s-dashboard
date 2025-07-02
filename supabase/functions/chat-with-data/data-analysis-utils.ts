export class DataAnalysisUtils {
  static analyzeReviewsByMonth(reviews: any[]): Record<string, number> {
    console.log('📅 Analyzing reviews by month...');
    const monthlyBreakdown: Record<string, number> = {};
    
    reviews.forEach(review => {
      if (review.Date && typeof review.Date === 'string') {
        try {
          // Use string manipulation to avoid timezone issues
          // Date format is expected to be "YYYY-MM-DD"
          const dateParts = review.Date.split('-');
          if (dateParts.length >= 2) {
            const year = dateParts[0];
            const month = dateParts[1];
            const monthKey = `${year}-${month}`;
            monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
            console.log(`✅ Processed review date ${review.Date} -> ${monthKey}`);
          } else {
            console.log(`⚠️ Unexpected date format: ${review.Date}`);
          }
        } catch (error) {
          console.error('❌ Error parsing date:', review.Date, error);
        }
      }
    });
    
    // Sort by month for better readability
    const sortedBreakdown: Record<string, number> = {};
    Object.keys(monthlyBreakdown)
      .sort()
      .forEach(key => {
        sortedBreakdown[key] = monthlyBreakdown[key];
      });
    
    console.log('📊 Monthly breakdown result:', sortedBreakdown);
    return sortedBreakdown;
  }

  static analyzeRecentReviews(reviews: any[]): { recentReviews: number; last90Days: number } {
    const now = new Date('2025-01-02T00:00:00Z'); // Current date context
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    console.log('🗓️ Current date context:', now.toISOString());
    console.log('🗓️ Filtering for reviews after:', thirtyDaysAgo.toISOString());
    
    let recentReviews = 0;
    let last90Days = 0;
    
    reviews.forEach(review => {
      if (review.Date) {
        const reviewDate = new Date(review.Date);
        const isRecent = reviewDate >= thirtyDaysAgo;
        if (isRecent) {
          console.log('✅ Found recent review:', review.Date, 'parsed as:', reviewDate.toISOString());
          recentReviews++;
        }
        if (reviewDate >= ninetyDaysAgo) {
          last90Days++;
        }
      }
    });
    
    console.log('📊 Reviews in last 30 days:', recentReviews);
    console.log('📊 Reviews in last 90 days:', last90Days);
    
    return { recentReviews, last90Days };
  }
}