import { OpenAIClient, OpenAIMessage } from './openai-client.ts';
import { SearchDecisionEngine } from './search-decision-engine.ts';
import { FunctionCallHandler } from './function-call-handler.ts';

export async function callOpenAI(context: string, message: string, consultantPrompt?: string, authHeader?: string): Promise<any> {
  console.log('🤖 Calling OpenAI with intelligent context and function calling...');
  console.log(`📏 Context length: ${context.length} characters`);
  console.log('🔧 Context length:', { context: context.length, prompt: consultantPrompt?.length || 0 });

  // Initialize components
  const client = new OpenAIClient();
  const functionHandler = new FunctionCallHandler(authHeader);
  
  // Analyze search requirements
  const searchDecision = SearchDecisionEngine.analyzeSearchRequirement(context, message);
  console.log('🌐 Smart search decision:', { 
    requiresWebsiteSearch: searchDecision.requiresWebsiteSearch, 
    hasConsultantPrompt: !!consultantPrompt,
    reason: searchDecision.searchReason
  });

  // Prepare tools and messages
  const tools = functionHandler.getAvailableTools();
  const toolChoice = SearchDecisionEngine.determineToolChoice(searchDecision);
  const messages = client.createMessages(context, message, consultantPrompt);

  // Make initial API call
  const initialResponse = await client.makeRequest(messages, tools, toolChoice);
  const choice = initialResponse.choices[0];

  // Handle tool calls if present
  if (choice.message.tool_calls) {
    const toolCalls = choice.message.tool_calls;
    const baseMessages = [...messages, choice.message];

    // Execute tool calls
    const executionResult = await functionHandler.executeToolCalls(toolCalls, baseMessages);
    
    // Return early for action functions
    if (executionResult.shouldReturnEarly) {
      return executionResult.earlyReturnChoice;
    }

    // Make final API call with tool results
    const finalResponse = await client.makeRequest(
      executionResult.messages,
      functionHandler.getActionFunctions(), // Only action functions for second call
      'auto'
    );

    const finalChoice = finalResponse.choices[0];
    // Let downstream validators know which tools produced this answer —
    // tool-computed data must not be treated as fabrication.
    finalChoice.executedTools = toolCalls.map((tc: any) => tc.function.name);
    return finalChoice;
  }

  return choice;
}