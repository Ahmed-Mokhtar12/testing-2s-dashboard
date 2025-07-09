
export class LanguageDetector {
  static detectLanguage(message: string): string {
    // Simple language detection - can be enhanced with more sophisticated detection
    const arabicPattern = /[\u0600-\u06FF]/;
    const englishPattern = /[a-zA-Z]/;
    
    if (arabicPattern.test(message)) {
      return 'Arabic';
    } else if (englishPattern.test(message)) {
      return 'English';
    }
    
    // Default to English as the primary language for Two Seasons Hotel
    return 'English';
  }
}
