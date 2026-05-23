'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';

// ---------- helpers ----------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Parse a UI-message-stream (SSE-style) line into an action.
function parseStreamLine(line) {
  if (!line || !line.startsWith('data: ')) return null;
  const payload = line.slice(6).trim(); // remove 'data: '
  if (payload === '[DONE]') return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export default function AIChatbot() {
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  // ---------- scroll ----------
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ---------- send ----------
  const sendUserMessage = useCallback(async (text) => {
    if (!text?.trim() || isLoading) return;

    const userMsg = {
      id: uid(),
      role: 'user',
      parts: [{ type: 'text', text: text.trim() }],
    };

    const assistantMsg = {
      id: uid(),
      role: 'assistant',
      parts: [],
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);
    setError(null);

    // Build the messages array the backend expects
    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role,
      parts: m.parts,
    }));

    try {
      abortRef.current = new AbortController();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Server error ${res.status}: ${errText}`);
      }

      // Stream the response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const parsed = parseStreamLine(trimmed);
          if (!parsed) continue;

          if (parsed.type === 'error') {
            throw new Error(parsed.errorText || 'Unknown stream error');
          }

          if (parsed.type === 'textDelta') {
            const text = parsed.textDelta || '';
            fullText += text;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  parts: [{ type: 'text', text: fullText }],
                };
              }
              return updated;
            });
          }

          if (parsed.type === 'toolCall') {
            const toolData = parsed.toolCall || {};
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                const existingParts = [...(last.parts || [])];
                existingParts.push({
                  type: 'tool-invocation',
                  toolInvocation: {
                    toolCallId: toolData.toolCallId || uid(),
                    toolName: toolData.toolName || 'tool',
                    state: 'result', // We mark it as done immediately since the server handles execution
                  },
                });
                updated[updated.length - 1] = { ...last, parts: existingParts };
              }
              return updated;
            });
          }
        }
      }

      // If we got no text at all, show a fallback
      if (!fullText.trim()) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.parts.some(p => p.type === 'text' && p.text?.trim())) {
            updated[updated.length - 1] = {
              ...last,
              parts: [{ type: 'text', text: '(No response received. Please try again.)' }],
            };
          }
          return updated;
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[OxyOS AI] Error:', err);
        setError(err);
        // Remove the empty assistant message
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && (!last.parts || last.parts.length === 0 || !last.parts.some(p => p.text?.trim()))) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, messages]);

  // ---------- handlers ----------
  const handleFormSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendUserMessage(trimmed);
    setInput('');
  }, [input, isLoading, sendUserMessage]);

  const handleQuickAction = useCallback((msg) => {
    if (isLoading) return;
    sendUserMessage(msg);
  }, [isLoading, sendUserMessage]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  // Don't render for non-CEO/admin roles
  if (role !== 'ceo' && role !== 'admin') return null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-[1000] overflow-hidden h-[600px] max-h-[70vh]"
          >
            {/* Header */}
            <div className="bg-[#1F3A5F] p-4 flex justify-between items-center text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-teal-400" />
                <h3 className="font-bold text-sm">OxyOS Assistant</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 text-gray-900">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-6 px-2">
                  <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium">Hi! I&apos;m your OxyOS Assistant.</p>
                  <p className="text-xs text-gray-400 mt-1 mb-5">Tap a shortcut or type anything below.</p>

                  <div className="grid grid-cols-2 gap-2 text-left">
                    {[
                      { emoji: '🌅', label: 'Morning Briefing', msg: 'Good morning, give me a full briefing.' },
                      { emoji: '🧪', label: 'Start Batch', msg: 'I want to start a new batch — walk me through the full protocol.' },
                      { emoji: '📋', label: 'Pending Leaves', msg: 'Show me all pending leave requests.' },
                      { emoji: '⚠️', label: 'Overdue Items', msg: 'Show me overdue compliance items.' },
                      { emoji: '📊', label: 'Analytics', msg: 'Give me a monthly summary of batches, tasks, and operations.' },
                      { emoji: '🏆', label: 'Team Performance', msg: 'Which employee has the highest task completion rate?' },
                    ].map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => handleQuickAction(action.msg)}
                        className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-all shadow-sm active:scale-95"
                      >
                        <span className="text-base">{action.emoji}</span>
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(m => {
                const parts = m.parts || [];
                return (
                  <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-[#1F3A5F] text-teal-400'}`}>
                      {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl max-w-[80%] text-sm shadow-sm ${m.role === 'user' ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'}`}>
                      {parts.map((part, idx) => {
                        if (part.type === 'text' && part.text?.trim()) {
                          return <div key={idx} className="whitespace-pre-wrap">{part.text}</div>;
                        }
                        if (part.type === 'tool-invocation') {
                          const t = part.toolInvocation;
                          return (
                            <div key={t?.toolCallId || idx} className="mt-2 text-xs bg-gray-50 p-2 rounded border border-gray-200 font-mono">
                              {t?.state === 'result' ? (
                                <div className="flex items-center gap-1 text-teal-700 font-medium">
                                  ✓ {t.toolName}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-amber-600 font-medium">
                                  <Loader2 className="w-3 h-3 animate-spin" /> {t?.toolName || 'working'}...
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                      {/* Show spinner if this is an empty assistant message while loading */}
                      {m.role === 'assistant' && parts.length === 0 && isLoading && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Something went wrong</p>
                    <p className="mt-1 text-red-600">{error.message || 'The AI encountered an error. Please try again.'}</p>
                    <button
                      onClick={() => setError(null)}
                      className="mt-2 text-red-800 underline font-bold hover:text-red-900"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
              <form onSubmit={handleFormSubmit} className="flex gap-2 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all text-gray-900"
                  disabled={isLoading}
                  autoComplete="off"
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="bg-red-500 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="bg-teal-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                )}
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-teal-700 hover:scale-105 transition-all z-[999]"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </>
  );
}
