export interface ChatRequest {
  message: string;
  messageId: string;
}

export interface ChatResponse {
  response: string;
  messageId: string;
  timestamp: string;
  consultant: string;
  dataStats: DataStats;
}

export interface DataStats {
  hotelReviews: number;
  chatHistory: number;
  infoSummary: number;
  conductedTraining: number;
  longTermMemory: number;
  vectorSearch: number;
}

export interface DatabaseRecord {
  [key: string]: any;
  created_at?: string;
}

export interface HotelReview extends DatabaseRecord {
  'Reviews Summary'?: string;
}

export interface InfoSummary extends DatabaseRecord {
  'Email Summary'?: string;
  'From'?: string;
  'To'?: string;
}

export interface TrainingRecord extends DatabaseRecord {
  'Summary of the training'?: string;
}

export interface ChatHistory extends DatabaseRecord {
  'Sender Message'?: string;
  'Ai Reply'?: string;
}

export interface LongTermMemory extends DatabaseRecord {
  message?: string;
}

export interface VectorSearch extends DatabaseRecord {
  content?: string;
}

export interface SmartQueryAnalysis {
  type: 'specific_month' | 'date_range' | 'recent_period' | 'analytics' | 'general';
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: string;
  days?: number;
  description?: string;
}