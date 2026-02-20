export class ReviewAnalysisUtils {
  static analyzeReviewsBySource(reviews: any[]): Record<string, number> {
    const sourceCount: Record<string, number> = {};
    reviews.forEach(review => {
      const source = review.Source || 'Unknown';
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    });
    return sourceCount;
  }

  /**
   * Get today's and yesterday's date in Dubai timezone (UTC+4)
   */
  static getDubaiDates(): { today: string; yesterday: string; todayDate: Date } {
    const nowUTC = new Date();
    const dubaiOffsetMs = 4 * 60 * 60 * 1000;
    const dubaiNow = new Date(nowUTC.getTime() + dubaiOffsetMs);

    const fmt = (d: Date) => d.toISOString().substring(0, 10);
    const todayStr = fmt(dubaiNow);

    const yesterdayDubai = new Date(dubaiNow.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = fmt(yesterdayDubai);

    return { today: todayStr, yesterday: yesterdayStr, todayDate: dubaiNow };
  }

  /**
   * Build a day-by-day breakdown for the last N days using Dubai time.
   */
  static analyzeReviewsByDay(reviews: any[], days: number = 14): Record<string, number> {
    const { todayDate } = this.getDubaiDates();
    const dailyBreakdown: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = 0; i < days; i++) {
      const d = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().substring(0, 10);
      dailyBreakdown[key] = 0;
    }

    reviews.forEach(review => {
      if (review.Date) {
        const dateStr = review.Date.toString().substring(0, 10);
        if (dateStr in dailyBreakdown) {
          dailyBreakdown[dateStr]++;
        }
      }
    });

    // Sort descending (most recent first)
    const sorted: Record<string, number> = {};
    Object.keys(dailyBreakdown).sort().reverse().forEach(k => {
      sorted[k] = dailyBreakdown[k];
    });

    return sorted;
  }

  static analyzeReviewsByDate(reviews: any[]): { recentReviews: number; last90Days: number } {
    const { todayDate } = this.getDubaiDates();
    const thirtyDaysAgo = new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(todayDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    let recentReviews = 0;
    let last90Days = 0;

    reviews.forEach(review => {
      if (review.Date) {
        const reviewDate = new Date(review.Date.toString());
        if (reviewDate >= thirtyDaysAgo) recentReviews++;
        if (reviewDate >= ninetyDaysAgo) last90Days++;
      }
    });

    return { recentReviews, last90Days };
  }

  static analyzeReviewsByMonth(reviews: any[]): Record<string, number> {
    const monthlyBreakdown: Record<string, number> = {};

    reviews.forEach(review => {
      if (review.Date) {
        try {
          const dateStr = review.Date.toString();
          let monthKey = '';
          if (dateStr.includes('-')) {
            const dateParts = dateStr.split('-');
            if (dateParts.length >= 2) {
              monthKey = `${dateParts[0]}-${dateParts[1]}`;
            }
          } else {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              monthKey = `${year}-${month}`;
            }
          }
          if (monthKey) {
            monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
          }
        } catch (_error) {
          // skip unparseable dates
        }
      }
    });

    const sortedBreakdown: Record<string, number> = {};
    Object.keys(monthlyBreakdown).sort().forEach(key => {
      sortedBreakdown[key] = monthlyBreakdown[key];
    });

    return sortedBreakdown;
  }
}
