'use client';
import { Loader2, Trash2 } from 'lucide-react';

/**
 * ConfirmDialogs — groups the 3 confirmation dialogs for formulations:
 * - Rejection reason entry (approvers only)
 * - Delete recipe confirmation
 * - Archive formulation confirmation
 */
export default function ConfirmDialogs({
  rejectingId, rejectionReason, setRejectionReason, onConfirmReject, onCancelReject,
  pendingDeleteId, actionLoading, onConfirmDelete, onCancelDelete,
  pendingArchiveId, onConfirmArchive, onCancelArchive,
}) {
  return (
    <>
      {/* Rejection reason modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Reject Formulation</h3>
            <p className="text-xs text-slate-500 mb-4">You must provide a reason for sending this recipe back to Draft.</p>
            <textarea
              autoFocus
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g. Yield calculation in Phase 2 seems incorrect..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium h-32 outline-none focus:ring-1 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={onCancelReject} className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold">Cancel</button>
              <button onClick={onConfirmReject} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDeleteId && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Delete Recipe</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Are you sure you want to permanently delete this recipe? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={onCancelDelete} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition">Cancel</button>
              <button
                onClick={onConfirmDelete}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition inline-flex items-center justify-center gap-2"
                disabled={actionLoading === pendingDeleteId}
              >
                {actionLoading === pendingDeleteId ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Trash2 className="w-4 h-4"/>Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation modal */}
      {pendingArchiveId && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Archive Formulation</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Are you sure you want to archive this formulation? It will be hidden and no longer possible to create batches from it.</p>
            <div className="flex gap-3">
              <button onClick={onCancelArchive} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition">Cancel</button>
              <button onClick={onConfirmArchive} className="flex-1 py-2 bg-slate-600 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition">Archive</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
