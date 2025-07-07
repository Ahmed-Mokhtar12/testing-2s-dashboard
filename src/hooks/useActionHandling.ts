import { useToast } from '@/hooks/use-toast';
import { Message, ActionData } from '@/types/chat';
import { executeAction } from '@/utils/messageSender';

export const useActionHandling = () => {
  const { toast } = useToast();

  const handleActionConfirm = async (
    messageId: string, 
    actionData: ActionData,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, actionStatus: 'executing' as const, actionData }
        : msg
    ));

    try {
      const result = await executeAction(actionData, messageId);
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, actionStatus: 'completed' as const }
          : msg
      ));

      toast({
        title: "Action Completed",
        description: `${actionData.type === 'email' ? 'Email' : actionData.type.toUpperCase()} sent successfully`,
      });

    } catch (error) {
      console.error('❌ Action execution error:', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        actionData,
        messageId
      });
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, actionStatus: 'failed' as const }
          : msg
      ));
      
      let errorTitle = "Action Failed";
      let errorDescription = `Failed to send ${actionData.type}. Please try again.`;
      
      if (error.message.includes('Network error')) {
        errorTitle = "Connection Error";
        errorDescription = "Could not connect to the messaging service. Please check your internet connection.";
      } else if (error.message.includes('timeout')) {
        errorTitle = "Timeout Error";
        errorDescription = "The messaging service is taking too long to respond. Please try again.";
      } else if (error.message.includes('webhook URL')) {
        errorTitle = "Configuration Error";
        errorDescription = "The messaging service is not properly configured. Please contact support.";
      } else if (error.message.includes('Service unavailable')) {
        errorTitle = "Service Unavailable";
        errorDescription = "The messaging service is currently unavailable. Please try again later.";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    }
  };

  const handleActionCancel = (
    messageId: string,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, hasAction: false, actionData: undefined, actionStatus: undefined }
        : msg
    ));

    toast({
      title: "Action Cancelled",
      description: "The action has been cancelled.",
    });
  };

  return { handleActionConfirm, handleActionCancel };
};