import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationContextAnalyzer } from '../../supabase/functions/chat-with-data/conversation-context-analyzer.ts';

// History arrives NEWEST FIRST (index.ts orders created_at desc, limit 30). The old
// slice(-5) took the five OLDEST turns and called them "recent" (audit E8).
test('the newest exchange is the one treated as recent', () => {
  const history = [
    { user_message: 'and the average score?', ai_response: 'Average: 4.5 out of 5 this month' },
    ...Array.from({ length: 6 }, (_, i) => ({ user_message: `old ${i}`, ai_response: 'ok' })),
  ];
  const data = ConversationContextAnalyzer.analyzeConversationHistory(history);
  assert.equal(data.recentDataPoints.has('recent_score'), true);
});
