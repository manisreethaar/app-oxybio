'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@ai-sdk/react';

export default function AIChatbot() {
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, stop, append, setMessages } = useChat({
    api: '/api/chat',
  });

  // ---------- scroll ----------
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ---------- handlers ----------
  const handleQuickAction = useCallback((msg) => {
    if (isLoading) return;
    append({ role: 'user', content: msg });
  }, [isLoading, append]);

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

              {messages.map(m => (
                <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-[#1F3A5F] text-teal-400'}`}>
                    {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`p-3 rounded-2xl max-w-[80%] text-sm shadow-sm ${m.role === 'user' ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'}`}>
                    
                    {/* Render Text Content */}
                    {m.content && (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                    
                    {/* Render Tool Invocations */}
                    {m.toolInvocations?.map((t) => (
                      <div key={t.toolCallId} className="mt-2 text-xs bg-gray-50 p-2 rounded border border-gray-200 font-mono">
                        {t.state === 'result' ? (
                          <div className="flex items-center gap-1 text-teal-700 font-medium">
                            ✓ {t.toolName}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-600 font-medium">
                            <Loader2 className="w-3 h-3 animate-spin" /> {t.toolName || 'working'}...
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {/* Empty placeholder during loading */}
                    {m.role === 'assistant' && !m.content && (!m.toolInvocations || m.toolInvocations.length === 0) && isLoading && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Something went wrong</p>
                    <p className="mt-1 text-red-600">{error.message || 'The AI encountered an error. Please try again.'}</p>
                    <button
                      onClick={() => {
                        setMessages(messages.filter(m => m.id !== error.id));
                      }}
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
              <form onSubmit={handleSubmit} className="flex gap-2 relative">
                <input
                  type="text"
                  value={input || ''}
                  onChange={handleInputChange}
                  placeholder="Ask me anything..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all text-gray-900"
                  disabled={isLoading}
                  autoComplete="off"
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={() => stop()}
                    className="bg-red-500 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!(input || '').trim()}
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
