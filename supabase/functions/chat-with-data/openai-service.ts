
import { SearchService } from './search-service.ts';
import { UncertaintyManager } from './uncertainty-manager.ts';

export class OpenAIService {
  private apiKey: string;
  private searchService: SearchService;
  private uncertaintyManager: UncertaintyManager;

  constructor() {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    this.apiKey = apiKey;
    this.searchService = new SearchService();
    this.uncertaintyManager = new UncertaintyManager();
  }

  async generateResponse(context: string, message: string, availableData?: any): Promise<string> {
    console.log('🤖 Calling OpenAI API with enhanced database context...');
    console.log('📏 Context length:', context.length, 'characters');
    
    // Log context sample for debugging
    console.log('📄 Context preview:', context.substring(0, 500) + '...');

    // Analyze question clarity and context relevance
    const clarityAnalysis = this.uncertaintyManager.analyzeQuestionClarity(message);
    console.log('🔍 Question clarity analysis:', clarityAnalysis);

    let contextAssessment = { confidenceLevel: 'HIGH' as 'HIGH' | 'MEDIUM' | 'LOW' };
    if (availableData) {
      contextAssessment = this.uncertaintyManager.assessContextRelevance(availableData, message);
      console.log('📊 Context relevance assessment:', contextAssessment);
    }

    // Enhanced system prompt with database access clarity
    const enhancedContext = `${context}

=== 🎯 FINAL CRITICAL REMINDER ===
YOU ARE CONNECTED TO TWO SEASONS HOTEL'S DATABASE AND HAVE FULL ACCESS TO:
- Real hotel guest reviews and ratings
- Actual staff training records  
- Historical guest interactions and chat logs
- Email communications and summaries
- Document uploads and contextual information
- Long-term conversation memory

CONFIDENCE LEVEL: ${contextAssessment.confidenceLevel}

RESPOND AS: Senior Hotel Management Consultant with direct database access
USE: Actual operational data provided above
AVOID: Claiming you don't have access to hotel systems or data

Current guest/management question: ${message}`;

    const functions = this.searchService.getAvailableFunctions();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-2025-04-14',
          messages: [
            { role: 'system', content: enhancedContext },
            { role: 'user', content: message }
          ],
          functions: functions,
          function_call: "auto",
          temperature: 0.7,
          max_tokens: 1200,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ OpenAI API Error:', response.status, errorText);
        throw new Error(`OpenAI API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      // Handle function calls
      if (choice.message.function_call) {
        console.log('🔧 AI requested function call:', choice.message.function_call);
        
        const functionName = choice.message.function_call.name;
        const functionArgs = JSON.parse(choice.message.function_call.arguments);
        
        try {
          const functionResult = await this.searchService.executeFunction(functionName, functionArgs);
          console.log('✅ Function executed successfully');
          
          // Call OpenAI again with the function result
          const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4.1-2025-04-14',
              messages: [
                { role: 'system', content: enhancedContext },
                { role: 'user', content: message },
                { role: 'assistant', content: null, function_call: choice.message.function_call },
                { role: 'function', name: functionName, content: functionResult }
              ],
              temperature: 0.7,
              max_tokens: 1200,
              presence_penalty: 0.1,
              frequency_penalty: 0.1
            }),
          });

          if (!followUpResponse.ok) {
            const errorText = await followUpResponse.text();
            console.error('❌ OpenAI Follow-up API Error:', followUpResponse.status, errorText);
            throw new Error(`OpenAI Follow-up API Error: ${followUpResponse.statusText}`);
          }

          const followUpData = await followUpResponse.json();
          const finalResponse = followUpData.choices[0].message.content;
          
          console.log('✅ Generated final AI response with function call result');
          return finalResponse;
          
        } catch (functionError) {
          console.error('❌ Function execution error:', functionError);
          
          const errorResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4.1-2025-04-14',
              messages: [
                { role: 'system', content: enhancedContext },
                { role: 'user', content: message },
                { role: 'system', content: `The search function failed with error: ${functionError.message}. Please respond based on your existing hotel database knowledge and acknowledge that you couldn't access current external information.` }
              ],
              temperature: 0.7,
              max_tokens: 1200
            }),
          });

          const errorData = await errorResponse.json();
          return errorData.choices[0].message.content;
        }
      }

      // No function call needed, return the direct response
      const aiResponse = choice.message.content;
      console.log('✅ Generated AI response with database context, length:', aiResponse.length, 'characters');
      
      // Log response preview for debugging
      console.log('📤 AI Response preview:', aiResponse.substring(0, 200) + '...');
      
      return aiResponse;
      
    } catch (error) {
      console.error('❌ OpenAI Service Error:', error);
      throw error;
    }
  }
}
