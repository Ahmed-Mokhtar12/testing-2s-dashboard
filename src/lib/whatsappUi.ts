// Shared presentation helpers for the WhatsApp inbox. These existed in three
// diverged copies (desktop sidebar, mobile sidebar, chat panel) — the panel
// header even showed different initials than the list for the same contact.
// One definition each, imported everywhere.

export interface ChatPreview {
  senderNumber: string;
  name?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
  avatar?: string;
}

export const formatPhoneNumber = (number: string): string => {
  if (number.startsWith('971')) {
    return `+${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
  }
  return `+${number}`;
};

// Deterministic color palette for initials avatars (deliberate deviation from
// WhatsApp's gray silhouette: color helps an operator scan many guests).
const AVATAR_COLORS = [
  'bg-[#F44336]', 'bg-[#E91E63]', 'bg-[#9C27B0]', 'bg-[#673AB7]',
  'bg-[#3F51B5]', 'bg-[#2196F3]', 'bg-[#009688]', 'bg-[#4CAF50]',
  'bg-[#FF9800]', 'bg-[#FF5722]', 'bg-[#795548]', 'bg-[#607D8B]',
];

export const getAvatarColor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

export const getInitials = (name: string | undefined, number: string): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const second = parts[1]?.[0] ?? '';
    return (first + second).toUpperCase() || number.slice(-2);
  }
  return number.slice(-2);
};
