export class PerformanceMonitor {
  private static timings: Map<string, number> = new Map();
  private static operations: Map<string, any[]> = new Map();
  
  static startTimer(operation: string): void {
    this.timings.set(operation, Date.now());
    console.log(`⏱️ Starting ${operation}...`);
  }
  
  static endTimer(operation: string): number {
    const startTime = this.timings.get(operation);
    if (!startTime) {
      console.warn(`⚠️ Timer not found for operation: ${operation}`);
      return 0;
    }
    
    const duration = Date.now() - startTime;
    this.timings.delete(operation);
    
    console.log(`✅ ${operation} completed in ${duration}ms`);
    
    // Track operation history
    const history = this.operations.get(operation) || [];
    history.push({
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 10 operations
    if (history.length > 10) {
      history.shift();
    }
    
    this.operations.set(operation, history);
    
    return duration;
  }
  
  static logPerformanceMetrics(): void {
    console.log('📊 Performance Metrics Summary:');
    
    for (const [operation, history] of this.operations.entries()) {
      if (history.length > 0) {
        const durations = history.map((h: any) => h.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        
        console.log(`   ${operation}: avg=${avg.toFixed(0)}ms, min=${min}ms, max=${max}ms (${history.length} samples)`);
      }
    }
  }
  
  static monitorDatabaseOperation<T>(
    operation: string,
    promise: Promise<T>
  ): Promise<T> {
    this.startTimer(`db_${operation}`);
    
    return promise
      .then(result => {
        this.endTimer(`db_${operation}`);
        return result;
      })
      .catch(error => {
        this.endTimer(`db_${operation}`);
        console.error(`❌ Database operation ${operation} failed:`, error);
        throw error;
      });
  }
  
  static monitorAPICall<T>(
    service: string,
    promise: Promise<T>
  ): Promise<T> {
    this.startTimer(`api_${service}`);
    
    return promise
      .then(result => {
        this.endTimer(`api_${service}`);
        return result;
      })
      .catch(error => {
        this.endTimer(`api_${service}`);
        console.error(`❌ API call to ${service} failed:`, error);
        throw error;
      });
  }
  
  static getOperationStats(operation: string): any {
    const history = this.operations.get(operation);
    if (!history || history.length === 0) {
      return null;
    }
    
    const durations = history.map((h: any) => h.duration);
    return {
      operation,
      count: history.length,
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      latest: history[history.length - 1]
    };
  }
  
  static getSystemHealth(): any {
    const now = Date.now();
    const recent = now - 60000; // Last minute
    
    const recentOperations = [];
    for (const [operation, history] of this.operations.entries()) {
      const recentHistory = history.filter((h: any) => 
        new Date(h.timestamp).getTime() > recent
      );
      
      if (recentHistory.length > 0) {
        recentOperations.push({
          operation,
          count: recentHistory.length,
          avgDuration: recentHistory.reduce((sum: number, h: any) => sum + h.duration, 0) / recentHistory.length
        });
      }
    }
    
    return {
      timestamp: new Date().toISOString(),
      recentActivity: recentOperations,
      overallHealth: recentOperations.length > 0 ? 'active' : 'idle',
      averageResponseTime: recentOperations.length > 0 
        ? recentOperations.reduce((sum, op) => sum + op.avgDuration, 0) / recentOperations.length
        : 0
    };
  }
}
