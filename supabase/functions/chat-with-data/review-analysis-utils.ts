export class ReviewAnalysisUtils {
  static analyzeReviewsBySource(reviews: any[]): Record<string, number> {
    const sourceCount: Record<string, number> = {};
    reviews.forEach(review => {
      const source = review.Source || 'Unknown';
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    });
    return sourceCount;
  }

  static analyzeReviewsByDate(reviews: any[]): { recentReviews: number; last90Days: number } {
    const now = new Date('2025-01-02T00:00:00Z'); // Current date context
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    console.log('🗓️ Context Builder - Current date:', now.toISOString());
    console.log('🗓️ Context Builder - 30 days ago:', thirtyDaysAgo.toISOString());
    
    let recentReviews = 0;
    let last90Days = 0;
    
    reviews.forEach(review => {
      if (review.Date) {
        const reviewDate = new Date(review.Date);
        if (reviewDate >= thirtyDaysAgo) {
          recentReviews++;
        }
        if (reviewDate >= ninetyDaysAgo) {
          last90Days++;
        }
      }
    });
    
    console.log('🏗️ Context Builder - Recent reviews (30 days):', recentReviews);
    console.log('🏗️ Context Builder - Reviews (90 days):', last90Days);
    
    return { recentReviews, last90Days };
  }

  static analyzeReviewsByMonth(reviews: any[]): Record<string, number> {
    console.log('📅 Context Builder - Starting month analysis with', reviews.length, 'total reviews');
    const monthlyBreakdown: Record<string, number> = {};
    let processedCount = 0;
    let skippedCount = 0;
    let june2025Count = 0;
    
    reviews.forEach((review, index) => {
      if (review.Date) {
        try {
          // Convert date to string if it's not already
          const dateStr = review.Date.toString();
          
          // Handle both YYYY-MM-DD and other formats
          let monthKey = '';
          if (dateStr.includes('-')) {
            const dateParts = dateStr.split('-');
            if (dateParts.length >= 2) {
              const year = dateParts[0];
              const month = dateParts[1];
              monthKey = `${year}-${month}`;
            }
          } else {
            // Try parsing as ISO date
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              monthKey = `${year}-${month}`;
            }
          }
          
          if (monthKey) {
            monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
            processedCount++;
            
            // Track June 2025 specifically
            if (monthKey === '2025-06') {
              june2025Count++;
              if (june2025Count <= 5) { // Log first 5 for debugging
                console.log(`✅ June 2025 review #${june2025Count}: ${dateStr} -> ${monthKey}`);
              }
            }
          } else {
            console.log(`⚠️ Could not parse date: ${dateStr} (review #${index})`);
            skippedCount++;
          }
        } catch (error) {
          console.error('❌ Error parsing date:', review.Date, error);
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    });
    
    // Sort by month for better readability
    const sortedBreakdown: Record<string, number> = {};
    Object.keys(monthlyBreakdown)
      .sort()
      .forEach(key => {
        sortedBreakdown[key] = monthlyBreakdown[key];
      });
    
    console.log('📊 Month analysis summary:');
    console.log(`  - Total reviews processed: ${processedCount}`);
    console.log(`  - Reviews skipped (no valid date): ${skippedCount}`);
    console.log(`  - June 2025 reviews found: ${june2025Count}`);
    console.log('📊 Complete monthly breakdown:', sortedBreakdown);
    console.log('🎯 June 2025 verification:', sortedBreakdown['2025-06'] || 0);
    
    return sortedBreakdown;
  }
}