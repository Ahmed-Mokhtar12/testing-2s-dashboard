import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type AttachmentKind = 'document' | 'image' | 'video';

export interface StagedAttachment {
  file: File;
  kind: AttachmentKind;
  previewUrl?: string;
}

export interface UploadedAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
}

const MAX_SIZE = 16 * 1024 * 1024; // 16MB

// The whatsapp-attachments bucket is PRIVATE (staff-gated RLS since 2026-04-23);
// getPublicUrl links 400 for everyone, so URLs must be signed. The signed URL is
// stored in "Chat History".Media and fetched later by the operator UI and by
// Meta's { link } media fetch at send time, so the TTL must cover both.
const SIGNED_URL_TTL_SECONDS = 365 * 24 * 60 * 60; // 365 days

const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

export const detectKind = (file: File): AttachmentKind | null => {
  if (IMAGE_TYPES.includes(file.type)) return 'image';
  if (VIDEO_TYPES.includes(file.type)) return 'video';
  if (DOC_TYPES.includes(file.type)) return 'document';
  // fallback by extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'document';
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (ext && ['mp4', 'mov'].includes(ext)) return 'video';
  return null;
};

export const validateFile = (file: File): { ok: boolean; error?: string; kind?: AttachmentKind } => {
  if (file.size > MAX_SIZE) {
    return { ok: false, error: 'File exceeds 16MB limit.' };
  }
  const kind = detectKind(file);
  if (!kind) {
    return { ok: false, error: 'Unsupported file type.' };
  }
  return { ok: true, kind };
};

export const useWhatsAppAttachment = () => {
  const [isUploading, setIsUploading] = useState(false);

  const uploadAttachment = useCallback(
    async (file: File, senderNumber: string): Promise<UploadedAttachment | null> => {
      const validation = validateFile(file);
      if (!validation.ok || !validation.kind) {
        toast({ title: 'Cannot attach file', description: validation.error, variant: 'destructive' });
        return null;
      }

      setIsUploading(true);
      try {
        const safeName = file.name.replace(/[^\w.-]+/g, '_');
        const path = `${senderNumber}/${crypto.randomUUID()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('whatsapp-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) throw uploadError;

        const { data: signed, error: signError } = await supabase.storage
          .from('whatsapp-attachments')
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

        if (signError || !signed?.signedUrl) {
          throw signError ?? new Error('Could not create a signed URL for the upload.');
        }

        return {
          url: signed.signedUrl,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          kind: validation.kind,
        };
      } catch (err) {
        if (import.meta.env.DEV) console.error('Upload failed:', err);
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Could not upload file.',
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { uploadAttachment, isUploading };
};
