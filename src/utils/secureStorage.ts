const textEncoder = new TextEncoder();
const STORAGE_VERSION = 'v1';

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const deriveKey = async (userId: string): Promise<CryptoKey> => {
  const keyMaterial = textEncoder.encode(`${window.location.origin}:${userId}:sera-secure-storage`);
  const hash = await crypto.subtle.digest('SHA-256', keyMaterial);

  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptData = async (data: string, userId: string): Promise<string> => {
  const key = await deriveKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = textEncoder.encode(data);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);

  return `${STORAGE_VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
};

export const decryptData = async (encrypted: string, userId: string): Promise<string> => {
  const [version, ivValue, payloadValue] = encrypted.split(':');
  if (version !== STORAGE_VERSION || !ivValue || !payloadValue) {
    throw new Error('Unsupported encrypted payload');
  }

  const key = await deriveKey(userId);
  const iv = fromBase64(ivValue);
  const payload = fromBase64(payloadValue);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);

  return new TextDecoder().decode(decrypted);
};
