'use client';
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const CONFIG = {
  success: { icon: CheckCircle2,  bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', iconCls: 'text-emerald-500' },
  error:   { icon: XCircle,       bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     iconCls: 'text-red-500'     },
  warn:    { icon: AlertTriangle, bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   iconCls: 'text-amber-500'   },
  info:    { icon: Info,          bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    iconCls: 'text-blue-500'    },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    // Cap at 5 visible toasts — oldest gets dropped
    setToasts(prev => [...prev.slice(-4), { id, message: String(message), type }]);
    timers.current[id] = setTimeout(() => remove(id), 5000);
  }, [remove]);

  const toast = {
    success: (msg) => add(msg, 'success'),
    error:   (msg) => add(msg, 'error'),
    warn:    (msg) => add(msg, 'warn'),
    info:    (msg) => add(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={{ toasts, remove, toast }}>
      {children}
      <div className="fixed bottom-6 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(t => {
            const cfg = CONFIG[t.type] || CONFIG.info;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm w-full ${cfg.bg} ${cfg.border} ${cfg.text}`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconCls}`} />
                <p className="flex-1 text-sm font-semibold leading-snug">{t.message}</p>
                <button
                  onClick={() => remove(t.id)}
                  className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
