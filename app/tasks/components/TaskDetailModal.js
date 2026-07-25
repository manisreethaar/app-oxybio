'use client';
import { useRef } from 'react';
import {
  CheckSquare, Timer, Eye, CheckCircle2, Paperclip,
  Trash2, X, Activity, BarChart2, MessageSquare
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatMinutes } from './utils';
import CreatorBadge from '@/components/ui/CreatorBadge';
import EditRequestButton from '@/components/ui/EditRequestButton';

/**
 * TaskDetailModal — slide-up modal showing full task detail, progress,
 * timer, checklist, submit-for-review, and approve/reject actions.
 *
 * All state and handlers are owned by the parent (tasks/page.js) and passed
 * as props. This keeps the modal stateless and easy to test.
 */
export default function TaskDetailModal({
  selectedTask,
  linkedSop,
  groupedTasks,
  employeeProfile,
  isMaster,
  canApprove,
  timerRunning,
  elapsedSeconds,
  progressPercentage,
  setProgressPercentage,
  progressNote,
  setProgressNote,
  completionNote,
  setCompletionNote,
  rejectNote,
  setRejectNote,
  proofFile,
  setProofFile,
  actionLoading,
  uploading,
  onClose,
  onAcknowledge,
  onStartTimer,
  onPauseTimer,
  onUpdateProgress,
  onSubmitForReview,
  onApprove,
  onReject,
  onEditTask,
  onDeleteTask,
  onToggleChecklist,
  pendingIds,
  onSuccess,
}) {
  const fileRef = useRef(null);
  const router = useRouter();

  if (!selectedTask) return null;

  return (
    <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white sm:rounded-xl w-full sm:max-w-md overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <span className={`px-1.5 py-0.5 rounded text-xs font-black uppercase border ${selectedTask.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-700'}`}>{selectedTask.priority}</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">{selectedTask.title}</h3>
            {linkedSop && (
              <a href="/sops" className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold uppercase bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100">
                Requires SOP: {linkedSop.title}
              </a>
            )}
          </div>
          <div className="flex gap-1 text-slate-400 items-center">
            <button
              onClick={() => router.push(`/messages?pin_type=task&pin_id=${selectedTask.id}&pin_title=${encodeURIComponent(selectedTask.title)}`)}
              className="p-1.5 rounded-md hover:bg-slate-50 hover:text-slate-600 transition-colors"
              title="Discuss Task"
            >
              <MessageSquare className="w-4 h-4"/>
            </button>
            {isMaster ? (
              <>
                <button onClick={() => onDeleteTask(selectedTask.id)} className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600" title="Delete Task"><Trash2 className="w-4 h-4"/></button>
                <button onClick={() => onEditTask(selectedTask)} className="p-1.5 rounded-md hover:bg-slate-50 hover:text-navy" title="Edit Task Settings"><Timer className="w-4 h-4 rotate-45"/></button>
              </>
            ) : (selectedTask?.assigned_by && String(selectedTask.assigned_by) === String(employeeProfile?.id)) ? (
              <EditRequestButton
                tableName="tasks"
                recordId={selectedTask.id}
                moduleLabel="Tasks"
                fields={[
                  { key: 'title', label: 'Title' },
                  { key: 'description', label: 'Description', type: 'textarea' },
                  { key: 'priority', label: 'Priority', type: 'select', options: [
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'urgent', label: 'Urgent' },
                  ]},
                  { key: 'due_date', label: 'Due Date', type: 'date' },
                ]}
                currentData={selectedTask}
                hasPending={pendingIds?.has(selectedTask.id)}
                allowDelete
                onSuccess={onSuccess}
              />
            ) : null}
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-50"><X className="w-4 h-4"/></button>
          </div>
        </div>

        <div className="p-5 pb-20 space-y-5">
          {/* Acknowledge Banner */}
          {!selectedTask.is_acknowledged && selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && (
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3 text-emerald-800">
                <Eye className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold">New Task assigned. Please acknowledge.</span>
              </div>
              <button onClick={() => onAcknowledge(selectedTask.id)} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-lg shadow-sm transition-colors">Acknowledge</button>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1">Assignees</p>
              <div className="flex flex-wrap gap-1">
                {groupedTasks.find(g => g.title === selectedTask.title && g.description === selectedTask.description)?.assignees.map((a, idx) => (
                  <span key={idx} className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-bold text-slate-700 text-xs flex items-center gap-1">
                    <CreatorBadge initials={a.assigned_user?.initials} fullName={a.assigned_user?.full_name} />
                    {a.assigned_user?.full_name?.split(' ')[0] || 'Staff'}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Due Date</p>
              <p className="font-bold text-slate-800">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : '—'}</p>
            </div>
          </div>

          {/* Progress Slider */}
          {selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && selectedTask.status !== 'done' && (
            <div className="space-y-4 border-y border-slate-100 py-5">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5"/> Work Progress</h4>
                <span className="text-sm font-black text-navy">{progressPercentage}%</span>
              </div>
              <input type="range" min="0" max="100" value={progressPercentage} onChange={(e) => setProgressPercentage(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-navy" />
              <form onSubmit={onUpdateProgress} className="flex gap-2">
                <input type="text" value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="What are you working on?..." className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-navy outline-none" />
                <button type="submit" disabled={actionLoading} className="px-4 bg-navy hover:bg-navy-hover text-white text-xs font-bold rounded-lg shadow-sm transition-all whitespace-nowrap">Log Note</button>
              </form>
            </div>
          )}

          {/* Activity Timeline */}
          {selectedTask.progress_logs?.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/> Activity Timeline</h4>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {selectedTask.progress_logs.map((log, i) => (
                  <div key={i} className="flex gap-3 relative pb-2 group">
                    {i < selectedTask.progress_logs.length - 1 && <div className="absolute left-1.5 top-4 w-px h-full bg-slate-100"></div>}
                    <div className={`w-3 h-3 rounded-full mt-1 shrink-0 z-10 ${log.percentage === 100 ? 'bg-emerald-500' : 'bg-navy'}`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-black text-slate-400">{new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                        <span className="text-xs font-black text-navy px-1 bg-slate-100 rounded">{log.percentage}%</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700 leading-snug">{log.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          {selectedTask.checklist?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-1.5">Checklist</p>
              <ul className="space-y-1.5">
                {selectedTask.checklist.map((item, i) => (
                  <li key={i} onClick={() => selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && onToggleChecklist(selectedTask, i)} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${item.done ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-100 cursor-pointer'}`}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>{item.done && <CheckCircle2 className="w-3 h-3 text-white"/>}</div>
                    <span className={`text-xs font-semibold ${item.done ? 'line-through opacity-70' : ''}`}>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timer */}
          {selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && selectedTask.status !== 'done' && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase text-slate-400 mb-1">Cumulative Time Spent</span>
                <span className="text-2xl font-black tabular-nums text-slate-900 tracking-tight">
                  {String(Math.floor(((selectedTask.logged_minutes || 0) * 60 + elapsedSeconds) / 3600)).padStart(2,'0')}:
                  {String(Math.floor((((selectedTask.logged_minutes || 0) * 60 + elapsedSeconds) % 3600) / 60)).padStart(2,'0')}:
                  {String(((selectedTask.logged_minutes || 0) * 60 + elapsedSeconds) % 60).padStart(2,'0')}
                </span>
              </div>
              {!timerRunning ? (
                <button onClick={() => onStartTimer(selectedTask)} className="px-3 py-1.5 bg-navy text-white font-bold text-xs rounded-lg shadow-sm hover:scale-105 transition-transform"><CheckSquare className="w-3.5 h-3.5 inline mr-1"/>Start & Acknowledge</button>
              ) : (
                <button onClick={onPauseTimer} className="px-3 py-1.5 bg-amber-500 text-white font-bold text-xs rounded-lg hover:bg-amber-600"><Timer className="w-3.5 h-3.5 inline mr-1"/>Pause Timer</button>
              )}
            </div>
          )}

          {/* Submit for Review */}
          {selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && selectedTask.status === 'in-progress' && selectedTask.approval_status !== 'pending_review' && (
            <form onSubmit={onSubmitForReview} className="space-y-3 border-t border-slate-100 pt-4">
              <textarea required value={completionNote} onChange={e => setCompletionNote(e.target.value)} rows="2" placeholder="Describe work done..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-accent outline-none bg-white resize-none"/>
              <div className="flex gap-2">
                <input type="file" ref={fileRef} className="hidden" onChange={e => setProofFile(e.target.files[0])} />
                <button type="button" onClick={() => fileRef.current.click()} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 bg-white"><Paperclip className="w-3.5 h-3.5"/> {proofFile ? 'File Attached' : 'Attach Proof'}</button>
                {proofFile && <button type="button" onClick={() => setProofFile(null)} className="text-red-500"><X className="w-4 h-4"/></button>}
              </div>
              <button type="submit" disabled={actionLoading || uploading} className="w-full py-2 bg-navy text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5">{uploading ? 'Uploading...' : 'Submit Work for Review'}</button>
            </form>
          )}

          {/* Proof & Completion Note */}
          {selectedTask.proof_url && <div className="pt-2"><a href={selectedTask.proof_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-slate-600 font-bold text-xs"><Paperclip className="w-3.5 h-3.5"/> View Proof</a></div>}
          {selectedTask.completion_note && <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-xs font-bold text-slate-400 uppercase">Completion Notes</p><p className="text-xs text-slate-700 font-medium">{selectedTask.completion_note}</p></div>}

          {/* Approve / Reject */}
          {canApprove && selectedTask.approval_status === 'pending_review' && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows="2" placeholder="Rejection notes..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-accent bg-white resize-none"/>
              <div className="flex gap-2">
                <button onClick={() => onApprove(selectedTask.id)} className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs">Approve</button>
                <button onClick={() => onReject(selectedTask.id)} disabled={!rejectNote.trim()} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg text-xs disabled:opacity-40">Return</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
