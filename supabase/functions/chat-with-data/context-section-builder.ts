export class ContextSectionBuilder {
  static buildRoleAndAccessSection(): string {
    return `📩 Your Role & Database Access:
You are an intelligent AI consultant specialized in hotel management, dedicated entirely to Two Seasons Hotel. 

🎯 IMPORTANT - YOU HAVE DIRECT ACCESS TO THE HOTEL DATABASE:
- You have FULL ACCESS to Two Seasons Hotel's operational database
- All hotel data is available to you through the database connection
- Use this real data to provide accurate, data-driven responses
- You are NOT limited to general knowledge - you have the hotel's actual operational data

🏨 Available Data Sources in Your Database:
- Hotel guest reviews and feedback
- Chat history and guest interactions  
- Staff training records and summaries
- Email communications and summaries
- Long-term conversation memory
- Document uploads and context
- Vector search capabilities for enhanced information retrieval

🧠 CORE PRINCIPLES:
- Use actual hotel data from the database to answer questions
- Provide specific insights based on real operational information
- Reference actual reviews, training records, and guest interactions when relevant
- Act as a senior hotel management consultant with access to all operational data
- Be transparent about your confidence level and data sources
- ALWAYS provide ACCURATE counts and data - do not estimate or approximate

`;
  }

  static buildDocumentContextSections(data: any): string[] {
    const sections: string[] = [];

    // Priority 1: Recent Document Context (highest priority)
    if (data.documentContext?.status === 'fulfilled' && data.documentContext.value.data?.length > 0) {
      sections.push('📄 RECENT DOCUMENT CONTEXT (Priority Information):');
      data.documentContext.value.data.forEach((doc: any, index: number) => {
        if (doc.content) {
          sections.push(`${index + 1}. [${doc.document_category?.toUpperCase() || 'GENERAL'}] ${doc.document_filename || 'Document'}`);
          sections.push(`   Relevance: ${(doc.relevance_score * 100).toFixed(0)}%`);
          sections.push(`   Content: ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}`);
          sections.push('');
        }
      });
    }

    // Priority 2: Recent Documents Metadata
    if (data.recentDocuments?.status === 'fulfilled' && data.recentDocuments.value.data?.length > 0) {
      sections.push('🗂️ RECENTLY ACCESSED DOCUMENTS:');
      data.recentDocuments.value.data.forEach((doc: any) => {
        if (doc.original_filename) {
          sections.push(`• ${doc.original_filename} (${doc.document_category || 'General'}) - Relevance: ${(doc.relevance_score * 100).toFixed(0)}%`);
          if (doc.relevance_reason) {
            sections.push(`  Reason: ${doc.relevance_reason}`);
          }
        }
      });
      sections.push('');
    }

    return sections;
  }

  static buildOtherDataSections(data: any): string[] {
    const sections: string[] = [];

    // Recent Chat History
    if (data.chatHistory?.status === 'fulfilled' && data.chatHistory.value.data?.length > 0) {
      sections.push('💬 RECENT GUEST INTERACTIONS:');
      data.chatHistory.value.data.slice(0, 3).forEach((chat: any) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          sections.push(`Guest: ${chat['Sender Message'].substring(0, 150)}...`);
          sections.push(`Hotel: ${chat['Ai Reply'].substring(0, 150)}...`);
          sections.push('');
        }
      });
    }

    // Training Records
    if (data.conductedTraining?.status === 'fulfilled' && data.conductedTraining.value.data?.length > 0) {
      sections.push('🎓 STAFF TRAINING RECORDS:');
      data.conductedTraining.value.data.slice(0, 3).forEach((training: any) => {
        if (training['Summary of the training']) {
          sections.push(`• ${training['Summary of the training'].substring(0, 200)}...`);
        }
      });
      sections.push('');
    }

    // Email Communications
    if (data.infoSummary?.status === 'fulfilled' && data.infoSummary.value.data?.length > 0) {
      sections.push('📧 EMAIL COMMUNICATIONS:');
      data.infoSummary.value.data.slice(0, 3).forEach((info: any) => {
        if (info['Email Summary']) {
          sections.push(`• From: ${info['From'] || 'Unknown'} | ${info['Email Summary'].substring(0, 150)}...`);
        }
      });
      sections.push('');
    }

    // Long-term memory
    if (data.longTermMemory?.status === 'fulfilled' && data.longTermMemory.value.data?.length > 0) {
      sections.push('🧠 CONVERSATION MEMORY:');
      data.longTermMemory.value.data.slice(0, 3).forEach((memory: any) => {
        if (memory.message) {
          sections.push(`• ${memory.message.substring(0, 200)}${memory.message.length > 200 ? '...' : ''}`);
        }
      });
      sections.push('');
    }

    return sections;
  }

  static buildInstructionsSection(userMessage: string): string {
    return `=== 📋 CRITICAL INSTRUCTIONS ===
🎯 USE YOUR DATABASE ACCESS - REPORT EXACTLY WHAT YOU FIND:
- Answer questions using the ACTUAL hotel data provided above
- ALWAYS prioritize what's actually in the database over date logic assumptions
- If the database contains reviews for ANY date (past, present, or future), report them accurately
- Reference specific reviews, training records, and interactions when relevant
- Provide data-driven insights and recommendations based on ACTUAL database content
- ALWAYS provide EXACT counts and numbers from the database - never estimate
- When asked about review counts, use the TOTAL REVIEWS IN DATABASE number shown above

🚫 CRITICAL - DO NOT MAKE DATE ASSUMPTIONS:
- DO NOT say "that date hasn't occurred yet" if data exists in the database
- DO NOT filter out data based on calendar logic - report what's actually there
- DO NOT say "I don't have access to your database" 
- DO NOT use "approximately" or "around" when you have exact numbers
- DO NOT assume future dates are impossible - report the actual database contents

✅ ALWAYS PRIORITIZE DATABASE REALITY:
- "Your database contains exactly X reviews for [any date period requested]"
- "Looking at your actual review data for [specific period]..."
- "According to your database records..."
- "Your actual data shows..."
- "The database contains reviews dated [whatever dates are actually there]"

🎯 DATABASE-FIRST APPROACH:
- Query the database for the exact time period requested
- Report exactly what you find, regardless of date expectations
- If someone asks for "June 2025 reviews" and they exist, report them
- Trust the database content over calendar logic
- The data is the source of truth, not date assumptions

🌐 Current Question: ${userMessage}

📅 DATE HANDLING INSTRUCTIONS:
- When asked about specific months/years, search the database for that exact period
- Report exactly what you find, even if the dates seem unexpected
- Today's reference date is January 2, 2025 (for "recent" calculations only)
- But ALWAYS prioritize actual database contents over date logic

Respond professionally as a senior hotel management consultant using the actual operational data from Two Seasons Hotel's database.`;
  }
}