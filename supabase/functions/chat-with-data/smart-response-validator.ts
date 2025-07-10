// Smart Response Validator - Main coordinator for response validation
import { DataFabricationDetector } from './data-fabrication-detector.ts';
import { DataUtilizationScorer } from './data-utilization-scorer.ts';
import { ConversationContextValidator } from './conversation-context-validator.ts';
import { ResponseQualityChecker } from './response-quality-checker.ts';
import { ResponseEnhancementUtils } from './response-enhancement-utils.ts';

export class SmartResponseValidator {
  
  static validateAIResponse(
    response: any, 
    userMessage: string, 
    conversationData: any, 
    availableData?: any
  ): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
    dataUtilizationScore: number;
    overallScore?: number;
    breakdown?: any;
  } {
    // Early validation
    if (!response) {
      return { 
        isValid: false, 
        issues: ['No response generated'], 
        suggestions: ['Generate a proper response'],
        dataUtilizationScore: 0 
      };
    }

    const content = response.message?.content || '';
    const allIssues: string[] = [];
    const allSuggestions: string[] = [];

    // 1. Check for data fabrication (most critical)
    const fabricationResult = DataFabricationDetector.detectFabrication(content);
    const fabricationIssues = DataFabricationDetector.generateFabricationIssues(fabricationResult);
    allIssues.push(...fabricationIssues.issues);
    allSuggestions.push(...fabricationIssues.suggestions);

    // 2. Score data utilization
    const utilizationResult = DataUtilizationScorer.scoreDataUtilization(
      content, 
      availableData, 
      fabricationResult
    );
    allIssues.push(...utilizationResult.issues);
    allSuggestions.push(...utilizationResult.suggestions);

    // 3. Validate conversation context
    const contextResult = ConversationContextValidator.validateConversationContinuity(
      content,
      userMessage,
      conversationData
    );
    allIssues.push(...contextResult.issues);
    allSuggestions.push(...contextResult.suggestions);

    // 4. Check language consistency
    const languageResult = ConversationContextValidator.checkLanguageConsistency(content);
    allIssues.push(...languageResult.issues);
    allSuggestions.push(...languageResult.suggestions);

    // 5. Validate tool usage
    const toolResult = ConversationContextValidator.validateToolUsage(userMessage, response);
    allIssues.push(...toolResult.issues);
    allSuggestions.push(...toolResult.suggestions);

    // 6. Check response quality
    const qualityResult = ResponseQualityChecker.checkResponseCompleteness(content, availableData);
    allIssues.push(...qualityResult.issues);
    allSuggestions.push(...qualityResult.suggestions);

    // 7. Calculate overall quality
    const overallQuality = ResponseQualityChecker.calculateOverallQuality(
      utilizationResult.score,
      contextResult.contextScore,
      qualityResult.qualityScore,
      fabricationResult.fabricationScore
    );

    // Determine if response is valid
    const isValid = allIssues.length === 0 && overallQuality.overallScore > 0.6;

    return {
      isValid,
      issues: allIssues,
      suggestions: allSuggestions,
      dataUtilizationScore: utilizationResult.score,
      overallScore: overallQuality.overallScore,
      breakdown: overallQuality.breakdown
    };
  }

  static enhanceResponseIfNeeded(
    response: any,
    userMessage: string,
    conversationData: any,
    validationResult: any
  ): any {
    if (validationResult.isValid) {
      return response;
    }

    console.log('🔧 Enhancing response based on validation issues:', validationResult.issues);

    // Enhance with conversation context
    let enhancedResponse = ResponseEnhancementUtils.enhanceResponseWithContext(
      response,
      conversationData,
      validationResult.issues
    );

    // Add consultant recommendations
    enhancedResponse = ResponseEnhancementUtils.addConsultantRecommendations(
      enhancedResponse,
      validationResult.suggestions
    );

    return enhancedResponse;
  }

  static logValidationResults(validationResult: any, context: any): void {
    ResponseEnhancementUtils.logValidationResults(validationResult, context);
  }
}