import { supabase } from '@/integrations/supabase/client';

export const testActionService = async () => {
  try {
    const testPayload = {
      type: 'sms',
      phoneNumber: '+1234567890',
      message: 'Test message from action service',
      messageId: `test-${Date.now()}`,
    };

    const { data, error } = await supabase.functions.invoke('execute-n8n-action', {
      body: testPayload,
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Test failed with error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (testError) {
    if (import.meta.env.DEV) console.error('Test exception:', testError);
    const message = testError instanceof Error ? testError.message : String(testError);
    return { success: false, error: message };
  }
};

if (typeof window !== 'undefined') {
  (window as unknown as { testActionService: typeof testActionService }).testActionService = testActionService;
}
