
export class UncertaintyManager {
  analyzeQuestionClarity(message: string): {
    clarityScore: number;
    ambiguityFlags: string[];
    requiresClarification: boolean;
  } {
    const ambiguityFlags: string[] = [];
    let clarityScore = 1.0;

    // Check for vague pronouns
    const vaguePronouns = /\b(it|this|that|they|them)\b/gi;
    if (vaguePronouns.test(message)) {
      ambiguityFlags.push('vague_pronouns');
      clarityScore -= 0.2;
    }

    // Check for multiple possible interpretations
    const multipleQuestions = message.split(/[?!.]/).filter(s => s.trim().length > 5).length;
    if (multipleQuestions > 2) {
      ambiguityFlags.push('multiple_questions');
      clarityScore -= 0.3;
    }

    // Check for missing context keywords
    const contextKeywords = /\b(when|where|who|what|how|why|which)\b/gi;
    if (!contextKeywords.test(message) && message.includes('?')) {
      ambiguityFlags.push('missing_context');
      clarityScore -= 0.2;
    }

    // Check for overly broad questions
    const broadTerms = /\b(everything|anything|all|any|general|overall)\b/gi;
    if (broadTerms.test(message)) {
      ambiguityFlags.push('overly_broad');
      clarityScore -= 0.25;
    }

    return {
      clarityScore: Math.max(0, clarityScore),
      ambiguityFlags,
      requiresClarification: clarityScore < 0.6
    };
  }

  assessContextRelevance(availableData: any, message: string): {
    relevanceScore: number;
    availableDataTypes: string[];
    missingDataTypes: string[];
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  } {
    const messageLower = message.toLowerCase();
    const availableDataTypes: string[] = [];
    const missingDataTypes: string[] = [];
    let relevanceScore = 0;

    // Check what data types are available
    if (availableData.hotelReviews?.status === 'fulfilled' && availableData.hotelReviews.value.data?.length > 0) {
      availableDataTypes.push('reviews');
      if (messageLower.includes('review') || messageLower.includes('guest') || messageLower.includes('feedback')) {
        relevanceScore += 0.3;
      }
    }

    if (availableData.documentContext?.status === 'fulfilled' && availableData.documentContext.value.data?.length > 0) {
      availableDataTypes.push('documents');
      if (messageLower.includes('document') || messageLower.includes('policy') || messageLower.includes('procedure')) {
        relevanceScore += 0.4;
      }
    }

    if (availableData.chatHistory?.status === 'fulfilled' && availableData.chatHistory.value.data?.length > 0) {
      availableDataTypes.push('chat_history');
      if (messageLower.includes('previous') || messageLower.includes('before') || messageLower.includes('history')) {
        relevanceScore += 0.2;
      }
    }

    if (availableData.conductedTraining?.status === 'fulfilled' && availableData.conductedTraining.value.data?.length > 0) {
      availableDataTypes.push('training');
      if (messageLower.includes('training') || messageLower.includes('staff') || messageLower.includes('procedure')) {
        relevanceScore += 0.3;
      }
    }

    // Check for missing critical data types based on question
    if ((messageLower.includes('review') || messageLower.includes('rating')) && !availableDataTypes.includes('reviews')) {
      missingDataTypes.push('guest_reviews');
    }

    if ((messageLower.includes('policy') || messageLower.includes('procedure')) && !availableDataTypes.includes('documents')) {
      missingDataTypes.push('policy_documents');
    }

    // Determine confidence level
    let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    if (relevanceScore >= 0.7) {
      confidenceLevel = 'HIGH';
    } else if (relevanceScore >= 0.4) {
      confidenceLevel = 'MEDIUM';
    } else {
      confidenceLevel = 'LOW';
    }

    return {
      relevanceScore,
      availableDataTypes,
      missingDataTypes,
      confidenceLevel
    };
  }

  generateClarificationPrompt(clarityAnalysis: any, contextAssessment: any, message: string): string | null {
    if (!clarityAnalysis.requiresClarification && contextAssessment.confidenceLevel !== 'LOW') {
      return null;
    }

    let clarificationPrompt = '';

    // Handle ambiguity issues
    if (clarityAnalysis.ambiguityFlags.includes('vague_pronouns')) {
      clarificationPrompt += '\n- Could you clarify what specifically you\'re referring to?';
    }

    if (clarityAnalysis.ambiguityFlags.includes('multiple_questions')) {
      clarificationPrompt += '\n- I see multiple questions. Which aspect would you like me to focus on first?';
    }

    if (clarityAnalysis.ambiguityFlags.includes('overly_broad')) {
      clarificationPrompt += '\n- Your question covers a broad topic. Could you be more specific about what aspect interests you most?';
    }

    // Handle missing context
    if (contextAssessment.missingDataTypes.length > 0) {
      clarificationPrompt += `\n- I don't have access to ${contextAssessment.missingDataTypes.join(', ')} data that might be relevant to your question.`;
    }

    if (clarificationPrompt) {
      return `I want to provide you with the most accurate and helpful answer possible. Before I respond, I have a few clarifying questions:${clarificationPrompt}

This will help me give you a more precise and satisfactory response based on the available hotel data.`;
    }

    return null;
  }

  enhanceSystemPromptWithUncertainty(basePrompt: string, confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'): string {
    const uncertaintyInstructions = `

🎯 UNCERTAINTY MANAGEMENT PROTOCOL:

CONFIDENCE LEVEL: ${confidenceLevel}

**Response Quality Standards:**
- Always prioritize accuracy over speed - it's better to ask for clarification than to guess
- If you're uncertain about any aspect of your answer, explicitly state your uncertainty level
- Provide partial answers with clarification requests when you don't have complete information
- Be transparent about your data sources and their limitations

**When to Ask Clarifying Questions:**
- If the question is ambiguous or could have multiple interpretations
- If you lack sufficient context to provide a complete, accurate answer
- If the question requires information you don't have access to
- If you need to make significant assumptions to answer

**Confidence Level Guidelines:**
- HIGH CONFIDENCE: You have specific, relevant data that directly answers the question
- MEDIUM CONFIDENCE: You have related information but need to make reasonable inferences
- LOW CONFIDENCE: Limited relevant information - ask for clarification or state limitations clearly

**Response Format When Uncertain:**
Start with: "Based on the available data, I can provide some insights, but I'd like to clarify a few points to give you a more complete answer..."

**Always Include:**
- Your confidence level in the response
- What data sources you're using
- Any limitations or gaps in available information
- Specific follow-up questions if needed

`;

    return basePrompt + uncertaintyInstructions;
  }
}
