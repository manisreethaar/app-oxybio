'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckSquare, BookOpen, AlertTriangle, FileSignature, ArrowRight } from 'lucide-react';
import Skeleton from '@/components/Skeleton';

const ICONS = {
  task: <CheckSquare className="w-4 h-4 text-slate-500" />,
  sop: <BookOpen className="w-4 h-4 text-emerald-500" />,
  capa: <AlertTriangle className="w-4 h-4 text-red-500" />,
  approval: <FileSignature className="w-4 h-4 text-amber-500" />
};

const BORDERS = {
  task: 'border-slate-100 bg-slate-50/30',
  sop: 'border-emerald-100 bg-emerald-50/30',
  capa: 'border-red-100 bg-red-50/30',
  approval: 'border-amber-100 bg-amber-50/30'
};

export default function MyPendingActionsWidget() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchActions() {
      try {
        const res = await fetch('/api/dashboard/pending-actions');
        const data = await res.json();
        if (data.success) {
          setActions(data.data);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchActions();
  }, []);

  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">My Pending Actions</h2>
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center text-red-500 font-medium text-sm">
        Failed to load pending actions.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
          My Pending Actions
          {actions.length > 0 && (
            <span className="text-xs font-black text-white bg-navy px-1.5 py-0.5 rounded-full">{actions.length}</span>
          )}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[400px]">
        {actions.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <CheckSquare className="w-5 h-5 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-700">You're all caught up!</p>
            <p className="text-xs text-slate-400 mt-1">No pending actions assigned to you.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {actions.map((action, idx) => (
              <Link 
                key={`${action.type}-${action.id}-${idx}`} 
                href={action.link}
                className={`flex items-start gap-4 p-5 hover:bg-slate-50 transition-colors border-l-4 ${BORDERS[action.type]?.split(' ')[0]} group`}
              >
                <div className="mt-1 p-2 bg-white rounded-lg shadow-sm border border-slate-100 shrink-0">
                  {ICONS[action.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate group-hover:text-navy transition-colors">{action.title}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{action.subtitle}</p>
                </div>
                {action.priority === 'urgent' && (
                  <span className="shrink-0 text-xs font-black uppercase tracking-widest text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Urgent</span>
                )}
                {action.priority === 'high' && action.type !== 'urgent' && (
                  <span className="shrink-0 text-xs font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">High</span>
                )}
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-navy transition-colors shrink-0 self-center opacity-0 group-hover:opacity-100 -ml-2 transform group-hover:translate-x-2" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
