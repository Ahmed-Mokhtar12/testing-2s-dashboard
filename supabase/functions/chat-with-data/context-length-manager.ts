export interface ContextValidation {
  isValid: boolean;
  length: number;
  maxLength: number;
  shouldTruncate: boolean;
  truncatedLength?: number;
}

export class ContextLengthManager {
  private static readonly MAX_CONTEXT_LENGTH = 12000; // Safe limit for GPT-4
  private static readonly TRUNCATION_TARGET = 10000; // Target after truncation
  
  static validateContextLength(context: string): ContextValidation {
    const length = context.length;
    const maxLength = this.MAX_CONTEXT_LENGTH;
    const shouldTruncate = length > maxLength;
    
    console.log('📏 Context length validation:', {
      length,
      maxLength,
      shouldTruncate,
      percentOfMax: Math.round((length / maxLength) * 100)
    });
    
    return {
      isValid: !shouldTruncate,
      length,
      maxLength,
      shouldTruncate,
      truncatedLength: shouldTruncate ? this.TRUNCATION_TARGET : undefined
    };
  }
  
  static truncateContext(context: string, targetLength: number = this.TRUNCATION_TARGET): string {
    if (context.length <= targetLength) {
      return context;
    }
    
    console.log('✂️ Truncating context from', context.length, 'to target', targetLength);
    
    // Split context into sections
    const sections = context.split('\n\n');
    let truncatedContext = '';
    let currentLength = 0;
    
    // Always include the role section (first section)
    if (sections.length > 0) {
      truncatedContext = sections[0] + '\n\n';
      currentLength = truncatedContext.length;
    }
    
    // Add sections by priority until we hit the target length
    for (let i = 1; i < sections.length && currentLength < targetLength * 0.9; i++) {
      const sectionToAdd = sections[i] + '\n\n';
      
      if (currentLength + sectionToAdd.length <= targetLength) {
        truncatedContext += sectionToAdd;
        currentLength += sectionToAdd.length;
      } else {
        // Partially add the section if it fits
        const remainingSpace = targetLength - currentLength - 100; // Leave buffer
        if (remainingSpace > 100) {
          const partialSection = sections[i].substring(0, remainingSpace) + '...\n\n';
          truncatedContext += partialSection;
        }
        break;
      }
    }
    
    // Add truncation notice
    truncatedContext += '\n🔄 [Context truncated for optimal processing]\n';
    
    console.log('✅ Context truncated to', truncatedContext.length, 'characters');
    return truncatedContext;
  }
  
  static optimizeContext(context: string): string {
    const validation = this.validateContextLength(context);
    
    if (validation.shouldTruncate) {
      return this.truncateContext(context, validation.truncatedLength!);
    }
    
    return context;
  }
}