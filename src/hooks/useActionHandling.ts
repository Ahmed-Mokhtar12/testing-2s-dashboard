import { useToast } from '@/hooks/use-toast';
import { Message, ActionData } from '@/types/chat';
import { executeAction } from '@/utils/messageSender';
import { getErrorMessage } from '@/utils/errorUtils';

export const useActionHandling = () => {
  const { toast } = useToast();

  const handleActionConfirm = async (
    messageId: string,
    actionData: ActionData,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, actionStatus: 'executing' as const, actionData }
          : msg
      )
    );

    try {
      await executeAction(actionData, messageId);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, actionStatus: 'completed' as const } : msg
        )
      );

      toast({
        title: 'Action Completed',
        description: `${actionData.type === 'email' ? 'Email' : actionData.type.toUpperCase()} sent successfully`,
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Action execution error:', error);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, actionStatus: 'failed' as const } : msg
        )
      );

      const errorMessage = getErrorMessage(error);
      let errorTitle = 'Action Failed';
      let errorDescription = `Failed to send ${actionData.type}. Please try again.`;

      if (errorMessage.includes('Network error')) {
        errorTitle = 'Connection Error';
        errorDescription = 'Could not connect to the messaging service. Please check your internet connection.';
      } else if (errorMessage.includes('timeout')) {
        errorTitle = 'Timeout Error';
        errorDescription = 'The messaging service is taking too long to respond. Please try again.';
      } else if (errorMessage.includes('webhook URL')) {
        errorTitle = 'Configuration Error';
        errorDescription = 'The messaging service is not properly configured. Please contact support.';
      } else if (errorMessage.includes('Service unavailable')) {
        errorTitle = 'Service Unavailable';
        errorDescription = 'The messaging service is currently unavailable. Please try again later.';
      }

      toast({
        title: errorTitle,
        description: errorDescription,
        variant: 'destructive',
      });
    }
  };

  const handleActionCancel = (
    messageId: string,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, hasAction: false, actionData: undefined, actionStatus: undefined }
          : msg
      )
    );

    toast({
      title: 'Action Cancelled',
      description: 'The action has been cancelled.',
    });
  };

  return { handleActionConfirm, handleActionCancel };
};
