export class ResponseFormatter {
  static formatConversationalResponse(aiResponse: string, context: any): string {
    console.log('💬 Formatting response for natural conversation flow...');
    
    // Remove technical prefixes and formal language
    let response = aiResponse
      .replace(/^(Based on|According to|Looking at|From the).+?[,:]\s*/i, '')
      .replace(/^(I can see|I notice|The data shows).+?[,:]\s*/i, '')
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/^\d+\.\s+/gm, '• ') // Convert numbered lists to bullets
      .replace(/^-\s+/gm, '• '); // Standardize bullet points

    // Add conversational transitions
    const conversationalStarters = [
      "Looking at your recent data, ",
      "I noticed something interesting - ",
      "Here's what stands out to me: ",
      "Quick observation: ",
      "This is important - "
    ];

    // Add natural follow-ups
    const naturalEndings = [
      " What's your take on this?",
      " Should we dive deeper into this area?",
      " Want me to analyze the specific causes?",
      " How does this align with what you're seeing operationally?",
      " Ready to tackle this together?"
    ];

    // Apply conversational style if response is too formal
    if (response.length > 300 || response.includes('comprehensive') || response.includes('analysis')) {
      const sentences = response.split('. ');
      if (sentences.length > 3) {
        // Keep first 2 sentences, add a follow-up question
        response = sentences.slice(0, 2).join('. ') + '. ' + 
          naturalEndings[Math.floor(Math.random() * naturalEndings.length)];
      }
    }

    // Ensure conversational flow
    if (!response.match(/^(Looking|I |Here's|Quick|This|Your)/)) {
      const starter = conversationalStarters[Math.floor(Math.random() * conversationalStarters.length)];
      response = starter + response.charAt(0).toLowerCase() + response.slice(1);
    }

    console.log('✅ Response formatted for natural conversation');
    return response;
  }
}
