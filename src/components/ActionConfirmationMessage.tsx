import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MessageSquare, Phone, Check, X, Clock, AlertCircle } from 'lucide-react';
import { ActionData } from '@/types/chat';

interface ActionConfirmationMessageProps {
  actionData: ActionData;
  actionStatus: 'pending_confirmation' | 'confirmed' | 'executing' | 'completed' | 'failed';
  onConfirm: (updatedActionData: ActionData) => void;
  onCancel: () => void;
}

const ActionConfirmationMessage: React.FC<ActionConfirmationMessageProps> = ({
  actionData,
  actionStatus,
  onConfirm,
  onCancel
}) => {
  const [editableData, setEditableData] = useState<ActionData>(actionData);

  // WhatsApp sending is disabled — never render a confirmation card for it.
  if (actionData.type === 'whatsapp') {
    return null;
  }

  const getActionIcon = () => {
    switch (actionData.type) {
      case 'email':
        return <Mail className="w-5 h-5" />;
      case 'sms':
        return <MessageSquare className="w-5 h-5" />;
      case 'whatsapp':
        return <Phone className="w-5 h-5" />;
      default:
        return <MessageSquare className="w-5 h-5" />;
    }
  };

  const getStatusIcon = () => {
    switch (actionStatus) {
      case 'pending_confirmation':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'confirmed':
      case 'executing':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'completed':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (actionStatus) {
      case 'pending_confirmation':
        return 'Waiting for confirmation';
      case 'confirmed':
        return 'Confirmed';
      case 'executing':
        return 'Executing...';
      case 'completed':
        return 'Completed successfully';
      case 'failed':
        return 'Failed to execute';
    }
  };

  const handleConfirm = () => {
    onConfirm(editableData);
  };

  const canEdit = actionStatus === 'pending_confirmation';

  return (
    <Card className="max-w-md border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getActionIcon()}
          {actionData.type === 'email' ? 'Send Email' : 
           actionData.type === 'sms' ? 'Send SMS' : 'Send WhatsApp Message'}
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {getStatusIcon()}
          {getStatusText()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">
            {actionData.type === 'email' ? 'Email Address' : 'Phone Number'}
          </label>
          {canEdit ? (
            <Input
              value={actionData.type === 'email' ? editableData.recipient : editableData.phoneNumber || ''}
              onChange={(e) => 
                actionData.type === 'email' 
                  ? setEditableData(prev => ({ ...prev, recipient: e.target.value }))
                  : setEditableData(prev => ({ ...prev, phoneNumber: e.target.value }))
              }
              className="mt-1"
            />
          ) : (
            <div className="mt-1 p-2 bg-muted rounded text-sm">
              {actionData.type === 'email' ? actionData.recipient : actionData.phoneNumber}
            </div>
          )}
        </div>

        {actionData.type === 'email' && (
          <div>
            <label className="text-sm font-medium text-foreground">Subject</label>
            {canEdit ? (
              <Input
                value={editableData.subject || ''}
                onChange={(e) => setEditableData(prev => ({ ...prev, subject: e.target.value }))}
                className="mt-1"
              />
            ) : (
              <div className="mt-1 p-2 bg-muted rounded text-sm">
                {actionData.subject}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-foreground">Message</label>
          {canEdit ? (
            <Textarea
              value={editableData.message}
              onChange={(e) => setEditableData(prev => ({ ...prev, message: e.target.value }))}
              className="mt-1 min-h-[100px]"
            />
          ) : (
            <div className="mt-1 p-2 bg-muted rounded text-sm whitespace-pre-wrap">
              {actionData.message}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleConfirm} className="flex-1">
              <Check className="w-4 h-4 mr-2" />
              Confirm & Send
            </Button>
            <Button variant="outline" onClick={onCancel} className="flex-1">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActionConfirmationMessage;