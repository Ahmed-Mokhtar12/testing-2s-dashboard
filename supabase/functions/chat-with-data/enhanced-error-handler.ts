export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export interface ErrorContext {
  operation: string;
  attempt: number;
  error: any;
  context?: string;
}

export class EnhancedErrorHandler {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };

  static async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    let lastError: any;

    for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          console.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        const errorContext: ErrorContext = {
          operation: operationName,
          attempt,
          error: error.message || error,
          context: error.stack
        };
        
        console.error(`❌ ${operationName} failed on attempt ${attempt}:`, errorContext);
        
        if (attempt === finalConfig.maxRetries) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffFactor, attempt - 1),
          finalConfig.maxDelay
        );
        
        console.log(`⏳ Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${finalConfig.maxRetries})`);
        await this.sleep(delay);
      }
    }
    
    throw this.createEnhancedError(lastError, operationName, finalConfig.maxRetries);
  }

  static createEnhancedError(originalError: any, operation: string, maxRetries: number): Error {
    const enhancedError = new Error(
      `${operation} failed after ${maxRetries} attempts: ${originalError.message || originalError}`
    );
    
    // Preserve original error properties
    enhancedError.stack = originalError.stack;
    (enhancedError as any).originalError = originalError;
    (enhancedError as any).operation = operation;
    (enhancedError as any).maxRetries = maxRetries;
    
    return enhancedError;
  }

  static createUserFriendlyMessage(error: any, operation: string): string {
    console.log('🔍 Creating user-friendly error message for:', operation, error);
    
    // OpenAI API specific errors
    if (error.message?.includes('OpenAI API Error')) {
      if (error.message.includes('rate limit')) {
        return "I'm experiencing high demand right now. Please try again in a moment.";
      }
      if (error.message.includes('timeout')) {
        return "The response is taking longer than expected. Please try asking a simpler question.";
      }
      return "I'm having trouble connecting to the AI service. Please try again.";
    }
    
    // Database errors
    if (operation.includes('database') || operation.includes('fetch')) {
      return "I'm having trouble accessing the hotel database. Please try again.";
    }
    
    // Context/processing errors
    if (operation.includes('context') || operation.includes('processing')) {
      return "I'm having trouble processing your request. Please try rephrasing your question.";
    }
    
    // Generic fallback
    return "I encountered an unexpected issue. Please try again or rephrase your question.";
  }

  static logError(error: any, context: string, additionalData?: any): void {
    const errorLog = {
      timestamp: new Date().toISOString(),
      context,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      additionalData
    };
    
    console.error('🚨 Enhanced Error Log:', JSON.stringify(errorLog, null, 2));
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isRetriableError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Retriable conditions
    const retriableConditions = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      'temporary',
      'unavailable'
    ];
    
    return retriableConditions.some(condition => errorMessage.includes(condition));
  }

  static shouldFallbackToCache(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Conditions where we should use cached data
    const fallbackConditions = [
      'openai api error',
      'timeout',
      'rate limit',
      'service unavailable'
    ];
    
    return fallbackConditions.some(condition => errorMessage.includes(condition));
  }
}