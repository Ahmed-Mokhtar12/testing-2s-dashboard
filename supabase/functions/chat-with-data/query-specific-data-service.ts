import { QueryAnalysis } from './query-analyzer.ts';

export interface DataFetchPlan {
  shouldFetchReviews: boolean;
  shouldFetchTraining: boolean;
  shouldFetchEmails: boolean;
  shouldFetchChat: boolean;
  shouldFetchDocuments: boolean;
  shouldFetchMemory: boolean;
  shouldFetchVector: boolean;
  priority: string[];
}

export class QuerySpecificDataService {
  static createFetchPlan(queryAnalysis: QueryAnalysis): DataFetchPlan {
    console.log('📋 Creating query-specific data fetch plan for:', queryAnalysis.type);
    
    const basePlan: DataFetchPlan = {
      shouldFetchReviews: false,
      shouldFetchTraining: false,
      shouldFetchEmails: false,
      shouldFetchChat: false,
      shouldFetchDocuments: false,
      shouldFetchMemory: false,
      shouldFetchVector: false,
      priority: []
    };

    switch (queryAnalysis.type) {
      case 'monthly_data':
      case 'review_summary':
        basePlan.shouldFetchReviews = true;
        basePlan.priority = ['reviews'];
        break;
        
      case 'recent_activity':
        basePlan.shouldFetchReviews = true;
        basePlan.shouldFetchChat = true;
        basePlan.shouldFetchMemory = true;
        basePlan.priority = ['reviews', 'chat', 'memory'];
        break;
        
      case 'training':
        basePlan.shouldFetchTraining = true;
        basePlan.priority = ['training'];
        break;
        
      case 'documents':
        basePlan.shouldFetchDocuments = true;
        basePlan.shouldFetchVector = true;
        basePlan.priority = ['documents', 'vector'];
        break;
        
      default:
        // For general queries, fetch core data sources only
        basePlan.shouldFetchReviews = true;
        basePlan.shouldFetchChat = true;
        basePlan.shouldFetchMemory = true;
        basePlan.priority = ['reviews', 'chat', 'memory'];
    }

    console.log('📊 Data fetch plan:', basePlan);
    return basePlan;
  }
}