'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { FlaskConical, Package, CheckCircle, XCircle, Clock } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import { format } from 'date-fns';

const STATUS_BADGE = {
  pending_review: { label: 'Pending Review', icon: Clock, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:       { label: 'Approved',       icon: CheckCircle, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected:       { label: 'Rejected',       icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
};

export default function ExperimentDetailClient({ initialExperiment }) {
  const { id } = useParams();
  const { canDo } = useAuth();
  const toast = useToast();

  const [experiment, setExperiment] = useState(initialExperiment);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  const canReview = canDo('rnd_experiments', 'review');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withTimeout(fetch(`/api/rnd-experiments/${id}`));
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load experiment');
      setExperiment(json.data);
    } catch (err) {
      toast.error(err.message);
    }
    setLoading(false);
  }, [id, toast]);



  const submitReview = async (decision) => {
    setReviewing(true);
    try {
      const res = await withTimeout(fetch(`/api/rnd-experiments/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, review_notes: reviewNotes || null }),
      }));
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit review');
      toast.success(`Experiment ${decision}.`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
    setReviewing(false);
  };

  if (loading) return <div className="p-12 text-center text-slate-500 font-bold">Loading experiment...</div>;
  if (!experiment) return <div className="p-12 text-center text-red-500 font-bold">Experiment not found</div>;

  const badge = STATUS_BADGE[experiment.status] || STATUS_BADGE.pending_review;
  const BadgeIcon = badge.icon;

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <MobilePageHeader title={experiment.experiment_id} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-8 h-8 text-navy" />
              <div>
                <h1 className="text-xl font-black text-navy">{experiment.experiment_id}</h1>
                <p className="text-sm font-bold text-slate-500">{experiment.title}</p>
              </div>
            </div>
            <span className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${badge.className}`}>
              <BadgeIcon className="w-3.5 h-3.5" /> {badge.label}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target Volume</p>
              <p className="text-sm font-bold text-slate-800">{experiment.target_volume_ml ? `${experiment.target_volume_ml} ml` : '—'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target pH</p>
              <p className="text-sm font-bold text-slate-800">{experiment.target_ph || '—'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target Brix</p>
              <p className="text-sm font-bold text-slate-800">{experiment.target_brix || '—'}</p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Ingredients Consumed</h3>
            {experiment.rnd_experiment_ingredients?.length > 0 ? (
              <ul className="space-y-1.5">
                {experiment.rnd_experiment_ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    {ing.item_name || 'Unknown item'}: <span className="font-bold">{ing.amount} {ing.unit || ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 italic">No ingredients recorded.</p>
            )}
          </div>

          {experiment.notes && (
            <div className="mb-6">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Process Notes</h3>
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">{experiment.notes}</p>
            </div>
          )}

          <div className="text-xs text-slate-400 font-semibold mb-6">
            Logged {format(new Date(experiment.created_at), 'MMM d, yyyy HH:mm')}
            {experiment.created_by_employee?.full_name ? ` by ${experiment.created_by_employee.full_name}` : ''}
          </div>

          {experiment.status !== 'pending_review' && (
            <div className={`p-4 rounded-xl border ${badge.className}`}>
              <p className="text-sm font-black mb-1">
                {experiment.status === 'approved' ? 'Approved' : 'Rejected'}
                {experiment.reviewed_by_employee?.full_name ? ` by ${experiment.reviewed_by_employee.full_name}` : ''}
                {experiment.reviewed_at ? ` · ${format(new Date(experiment.reviewed_at), 'MMM d, yyyy HH:mm')}` : ''}
              </p>
              {experiment.review_notes && <p className="text-sm">{experiment.review_notes}</p>}
            </div>
          )}

          {experiment.status === 'pending_review' && canReview && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Review Notes (optional)</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none"
                placeholder="Rationale for approval/rejection..."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => submitReview('approved')} disabled={reviewing} className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50">
                  ✓ Approve
                </button>
                <button onClick={() => submitReview('rejected')} disabled={reviewing} className="py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50">
                  ✗ Reject
                </button>
              </div>
            </div>
          )}
          {experiment.status === 'pending_review' && !canReview && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-semibold text-center">Awaiting review from leadership.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
