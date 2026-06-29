'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, XCircle, Clock, ShieldCheck, ChevronDown, ChevronUp,
  Loader2, RefreshCw, FileCheck, Trash2, Edit3, X, ArrowRight, History
} from 'lucide-react';

const STATUS_COLORS = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const CHANGE_TYPE_ICON = {
  edit:   <Edit3 className="w-4 h-4" />,
  delete: <Trash2 className="w-4 h-4" />,
};

function DiffRow({ label, original, proposed }) {
  const changed = JSON.stringify(original) !== JSON.stringify(proposed);
  return (
    <tr className={changed ? 'bg-amber-50/60' : ''}>
      <td className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400 w-36 align-top">{label}</td>
      <td className="px-3 py-2 text-xs text-slate-500 align-top max-w-[180px] break-words">
        {original === null || original === undefined ? <span className="italic text-slate-300">—</span> : String(original)}
      </td>
      {proposed !== undefined && (
        <>
          <td className="px-2 py-2 text-slate-300 align-top"><ArrowRight className="w-3 h-3 mt-0.5" /></td>
          <td className={`px-3 py-2 text-xs align-top max-w-[180px] break-words font-semibold ${changed ? 'text-amber-800' : 'text-slate-500'}`}>
            {proposed === null || proposed === undefined ? <span className="italic text-slate-300">—</span> : String(proposed)}
          </td>
        </>
      )}
    </tr>
  );
}

function ChangeCard({ change, onAction, isAdmin }) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const isPending = change.status === 'pending';
  const isDelete = change.change_type === 'delete';

  const diffKeys = change.proposed_data
    ? Object.keys(change.proposed_data)
    : Object.keys(change.original_data || {});

  async function submit(action) {
    if (action === 'reject' && note.trim().length < 3) return;
    setLoading(true);
    await onAction(change.id, action, note.trim() || undefined);
    setLoading(false);
    setRejecting(false);
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-4 p-5">
        {/* Requester avatar */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-cyan-100 border border-white shadow-sm shrink-0 flex items-center justify-center">
          <span className="text-slate-700 font-black text-sm">{change.requester?.initials || '??'}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-800 text-sm">{change.requester?.full_name || 'Unknown'}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{change.requester?.role}</span>
            <span className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${STATUS_COLORS[change.status]}`}>
              {CHANGE_TYPE_ICON[change.change_type]}
              {change.change_type}
            </span>
          </div>
          <div className="text-sm text-slate-600 font-semibold mt-0.5">{change.module_label || change.table_name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{new Date(change.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2.5 py-1 text-[11px] font-black uppercase tracking-widest rounded-xl border ${STATUS_COLORS[change.status]}`}>
            {change.status}
          </span>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-2 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-all"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/40 px-5 py-4 space-y-4">
          {isDelete ? (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Record to Delete</p>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full">
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(change.original_data || {}).map(([k, v]) => (
                      <DiffRow key={k} label={k} original={v} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Proposed Changes</p>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">Field</th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-300">Original</th>
                      <th className="px-2 py-1.5" />
                      <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase tracking-widest text-amber-400">Proposed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {diffKeys.map(k => (
                      <DiffRow
                        key={k}
                        label={k}
                        original={change.original_data?.[k]}
                        proposed={change.proposed_data?.[k]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Review note (for history) */}
          {change.review_note && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Review Note</p>
              <p className="text-sm text-slate-600 font-medium">{change.review_note}</p>
              {change.reviewer && (
                <p className="text-xs text-slate-400 mt-1">— {change.reviewer.full_name}</p>
              )}
            </div>
          )}

          {/* Action buttons for pending */}
          {isPending && isAdmin && (
            <div className="space-y-3">
              {rejecting ? (
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Reason for rejection (required)..."
                    rows={2}
                    className="w-full px-3 py-2.5 bg-white/70 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-red-300 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submit('reject')}
                      disabled={loading || note.trim().length < 3}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-xl disabled:opacity-40 transition-all"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Confirm Rejection
                    </button>
                    <button onClick={() => setRejecting(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-50 transition-all">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => submit('approve')}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-br from-emerald-500 to-slate-600 text-white font-black text-sm rounded-xl hover:from-emerald-400 hover:to-slate-500 transition-all shadow-sm disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve {isDelete ? 'Deletion' : 'Edit'}
                  </button>
                  <button
                    onClick={() => setRejecting(true)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-red-200 text-red-600 font-black text-sm rounded-xl hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const { role, isAdmin, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState('pending');
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!authLoading) {
      if (isAdmin) fetchChanges(tab);
      else if (role) router.push('/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authLoading, role, isAdmin]);

  async function fetchChanges(status) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pending-changes?status=${status}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChanges(data.data || []);
    } catch (err) {
      toast.error('Failed to load: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id, action, note) {
    try {
      const res = await fetch('/api/admin/pending-changes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(action === 'approve' ? 'Request approved and applied.' : 'Request rejected.');
      fetchChanges(tab);
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ShieldCheck className="w-16 h-16 text-slate-200" />
        <p className="text-slate-500 font-bold">Access Denied: Admin clearance required</p>
        <button onClick={() => router.push('/dashboard')} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Edit Approvals</h1>
          <p className="text-slate-500 mt-1 font-medium">Review and approve edit/delete requests from team members</p>
        </div>
        <button
          onClick={() => fetchChanges(tab)}
          className="p-2.5 rounded-xl bg-white/60 border border-white hover:bg-white transition-all text-slate-400 hover:text-slate-600"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/40 backdrop-blur-sm rounded-2xl p-1 border border-white/60 w-fit">
        {[
          { key: 'pending',  label: 'Pending',  icon: <Clock className="w-3.5 h-3.5" /> },
          { key: 'approved', label: 'Approved', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
          { key: 'rejected', label: 'Rejected', icon: <XCircle className="w-3.5 h-3.5" /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black transition-all ${
              tab === t.key
                ? 'bg-white shadow-sm text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
        </div>
      ) : changes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 glass-card rounded-2xl">
          {tab === 'pending'
            ? <Clock className="w-12 h-12 text-slate-200" />
            : tab === 'approved'
            ? <CheckCircle2 className="w-12 h-12 text-slate-200" />
            : <XCircle className="w-12 h-12 text-slate-200" />}
          <p className="text-slate-400 font-bold">No {tab} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changes.map(change => (
            <ChangeCard
              key={change.id}
              change={change}
              onAction={handleAction}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
