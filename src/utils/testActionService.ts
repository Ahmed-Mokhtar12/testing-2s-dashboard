import { supabase } from '@/integrations/supabase/client';

export const testActionService = async () => {
  console.log('🧪 Testing action service...');
  
  try {
    const testPayload = {
      type: 'sms',
      phoneNumber: '+1234567890',
      message: 'Test message from action service',
      messageId: 'test-' + Date.now()
    };
    
    console.log('🧪 Sending test request:', testPayload);
    
    const { data, error } = await supabase.functions.invoke('execute-n8n-action', {
      body: testPayload
    });
    
    console.log('🧪 Test response - data:', data);
    console.log('🧪 Test response - error:', error);
    
    if (error) {
      console.error('🧪 Test failed with error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('🧪 Test completed successfully');
    return { success: true, data };
    
  } catch (testError) {
    console.error('🧪 Test exception:', testError);
    const message = testError instanceof Error ? testError.message : String(testError);
    return { success: false, error: message };
  }
};

// Add to window for debugging in browser console
if (typeof window !== 'undefined') {
  (window as unknown as { testActionService: typeof testActionService }).testActionService = testActionService;
}