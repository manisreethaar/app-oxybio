const OPS_ASSISTANT_ROLES = new Set(['ceo', 'admin']);
const ALLOWED_MESSAGE_ROLES = new Set(['user', 'assistant', 'tool']);

export const CHAT_LIMITS = {
  maxMessages: 30,
  maxMessageChars: 4000,
  maxTotalChars: 20000,
};

export function canUseOpsAssistant(role) {
  return OPS_ASSISTANT_ROLES.has(String(role || '').toLowerCase());
}

function collectText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.parts)) return collectText(value.parts);
  if (Array.isArray(value.content)) return collectText(value.content);
  return '';
}

export function validateChatMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { ok: false, error: 'At least one chat message is required.' };
  }

  const messages = rawMessages.slice(-CHAT_LIMITS.maxMessages);
  let totalChars = 0;

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      return { ok: false, error: 'Every chat message must be an object.' };
    }
    if (!ALLOWED_MESSAGE_ROLES.has(message.role)) {
      return { ok: false, error: 'Unsupported chat message role.' };
    }

    const text = collectText(message.content || message.parts);
    totalChars += text.length;
    if (text.length > CHAT_LIMITS.maxMessageChars) {
      return { ok: false, error: `Each chat message must be ${CHAT_LIMITS.maxMessageChars} characters or less.` };
    }
  }

  if (totalChars > CHAT_LIMITS.maxTotalChars) {
    return { ok: false, error: `Chat context must be ${CHAT_LIMITS.maxTotalChars} characters or less.` };
  }

  const hasUserMessage = messages.some(message => message.role === 'user' && collectText(message.content || message.parts).trim());
  if (!hasUserMessage) return { ok: false, error: 'A user message is required.' };

  return { ok: true, messages };
}
