'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, CheckCircle, AlertTriangle, Clock, Filter,
  FlaskConical, XCircle, BookOpen,
  FileText, Download, Loader, Trash2, ArrowRight, MessageSquare,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import LinkedRecordsPanel from '@/components/batches/LinkedRecordsPanel';
import {
  normalizeStage,
  visibleWorkflowStage,
  isUpstreamStage,
} from '@/lib/batches/workflowStages';
import { useBatchWorkflow } from '@/lib/batches/useBatchWorkflow';

const PanelLoading = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="h-4 w-40 rounded bg-slate-200 animate-pulse mb-4" />
    <div className="space-y-3">
      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
    </div>
  </div>
);

const SeparationPanel = dynamic(() => import('./components/SeparationPanel'), { ssr: false, loading: PanelLoading });
const QCHoldPanel      = dynamic(() => import('./components/QCHoldPanel'),      { ssr: false, loading: PanelLoading });
const ReleasePanel     = dynamic(() => import('./components/ReleasePanel'),     { ssr: false, loading: PanelLoading });
const RejectionPanel   = dynamic(() => import('./components/RejectionPanel'),   { ssr: false, loading: PanelLoading });

const STAGES = [
  { id: 'straining',        label: 'Downstream Processing',icon: Filter,      color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200'  },
  { id: 'qc_hold',          label: 'QC Hold',          icon: Clock,       color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
  { id: 'released',         label: 'Released',         icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200'},
  { id: 'rejected',         label: 'Rejected',         icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
];

const PANEL_MAP = {
  straining: SeparationPanel,
  qc_hold: QCHoldPanel, released: ReleasePanel, rejected: RejectionPanel,
};

const STAGE_CHECKLIST_MAP = {
  straining:        'Downstream Processing',
  qc_hold:          'QC Hold',
  released:         'Release or Reject',
  rejected:         'Release or Reject',
};

export default function DownstreamDetailPage() {
  const { batchId } = useParams();
  const w = useBatchWorkflow({ batchId, module: 'downstream', listHref: '/downstream', stageChecklistMap: STAGE_CHECKLIST_MAP });
  const {
    role, employeeProfile, canDo, router, toast, supabase, stagePanelRef,
    batch, flasks, transitions, employees, availableStock, flaskEndpoints,
    lnbCount, lnbEntryId, lnbByFlask, loadError,
    isPostSterilisation, isTerminal,
    derivedStatus, selectedFlask, displayStage,
    actionLoading, bmrLoading, bmrUrl,
    pendingCancel, setPendingCancel, archiveReason, setArchiveReason,
    pendingFlaskReject, setPendingFlaskReject,
    pendingFlaskAdvance, setPendingFlaskAdvance, flaskAdvanceReason, setFlaskAdvanceReason,
    selectedFlaskId, setSelectedFlaskId, viewingStage, setViewingStage, editingStage, setEditingStage,
    globalError, setGlobalError,
    fetchAll, handleFlaskTransition, confirmFlaskAdvance, handleDirectTransition,
    handleExportBMR, handleCancelBatch, confirmCancelBatch,
  } = w;

  if (loadError && !batch) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-bold text-sm max-w-md">
          Couldn&apos;t load this batch. Your connection may be slow or unavailable.
        </div>
        <button onClick={fetchAll} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-lg">Retry</button>
      </div>
    );
  }

  if (!batch) return <div className="p-8 text-center text-slate-400 animate-pulse">Loading batch...</div>;

  const currentIdx = STAGES.findIndex(s => s.id === visibleWorkflowStage(batch.current_stage));
  const CurrentPanel = PANEL_MAP[displayStage] || null;

  return (
    <div className="page-container">
      <Link href="/downstream" className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-navy mb-4">
        <ArrowLeft className="w-3.5 h-3.5 mr-1"/> Back to Downstream
      </Link>

      {lnbCount === 0 && ['qc_hold', 'straining'].includes(batch.current_stage) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0"/>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">Lab Notebook is empty</p>
            <p className="text-xs text-amber-600">Cannot release without LNB entries.</p>
          </div>
          <Link href="/lab-notebook" className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg">Open LNB →</Link>
        </div>
      )}

      {/* Batch Header — always at top on all screen sizes */}
      <div className="card p-4 md:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono text-lg font-black text-slate-900 tracking-wider">{batch.batch_id}</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {batch.sku_target && batch.sku_target !== 'Unassigned' && (
                <span className={`px-2 py-0.5 rounded text-xs font-black uppercase border ${batch.sku_target==='CLARITY' ? 'bg-slate-50 text-slate-700 border-slate-200' : batch.sku_target==='MOMENTUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{batch.sku_target}</span>
              )}
              <span className="px-2 py-0.5 rounded text-xs font-black bg-slate-100 text-slate-600 border border-slate-200 uppercase">{batch.experiment_type}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-black uppercase border ${derivedStatus==='released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : derivedStatus==='rejected' ? 'bg-red-50 text-red-700 border-red-100' : derivedStatus==='fermenting' ? 'bg-navy/10 text-navy border-navy/20' : derivedStatus==='qc-hold' ? 'bg-red-50 text-red-700 border-red-100' : derivedStatus==='processing' ? 'bg-slate-50 text-slate-700 border-slate-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{derivedStatus}</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              {(() => {
                const maxEpHrs = flaskEndpoints.length > 0
                  ? Math.max(...flaskEndpoints.map(e => e.total_hours || 0))
                  : null;
                const hrs = maxEpHrs !== null
                  ? maxEpHrs
                  : (new Date() - new Date(batch.start_time)) / 3600000;
                return (
                  <>
                    <p className="text-xs text-slate-400 font-bold uppercase">{maxEpHrs !== null ? 'Fermentation' : 'Age'}</p>
                    <p className="text-xl font-black text-slate-800 tabular-nums">{hrs.toFixed(1)}<span className="text-xs text-slate-400"> hr</span></p>
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/messages?pin_type=batch&pin_id=${batch.batch_id}&pin_title=${encodeURIComponent('Batch ' + batch.batch_id)}`)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                title="Discuss this batch"
              >
                <MessageSquare className="w-3 h-3"/> Discuss
              </button>
              {!isTerminal && ['admin','ceo','cto'].includes(role) && (
                <button
                  onClick={handleCancelBatch}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-red-600 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                  title="Archive this batch"
                >
                  <Trash2 className="w-3 h-3"/> Archive Batch
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Recipe</p>
            <Link href="/formulations" className="font-bold text-slate-800 hover:text-navy hover:underline block">
              {batch.formulations?.name}
            </Link>
            <p className="text-slate-400">v{batch.formulations?.version}</p>
          </div>
          <div><p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Volume / Flasks</p><p className="font-bold text-slate-800">{batch.planned_volume_ml}ml × {batch.num_flasks}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* ── LEFT COLUMN — sidebar (stage nav + flask cards) ── */}
        {/* order-2/lg:order-1: on mobile panel content shows first, sidebar shows below */}
        <div className="space-y-4 order-2 lg:order-1">

          {/* Stage Timeline */}
          <div className="card p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Stage Timeline</p>
            <div className="space-y-0.5">
              {STAGES.filter(s => !['released','rejected'].includes(s.id)).map((stage, idx) => {
                let done, curr;
                if (isPostSterilisation) {
                  const flaskStageIdx = selectedFlask
                    ? STAGES.findIndex(s => s.id === visibleWorkflowStage(selectedFlask.current_stage))
                    : 2;
                  const effectiveIdx = flaskStageIdx < 2 ? 2 : flaskStageIdx;
                  done = idx < 2 || idx < effectiveIdx;
                  curr = idx === effectiveIdx;
                } else {
                  done = idx < currentIdx;
                  curr = idx === currentIdx;
                }
                const isViewing = viewingStage === stage.id;
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.id}
                    onClick={done ? () => { setViewingStage(isViewing ? null : stage.id); setEditingStage(null); } : undefined}
                    className={`flex items-center gap-2.5 py-2 px-3 rounded-lg transition-all ${
                      isViewing ? `${stage.bg} border-2 ${stage.border} ring-2 ring-offset-1 ring-navy/30` :
                      curr ? `${stage.bg} border ${stage.border}` :
                      done ? 'hover:bg-slate-50 cursor-pointer' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${done ? 'bg-navy border-navy' : curr ? `${stage.bg} ${stage.border}` : 'bg-slate-50 border-slate-200'}`}>
                      {done
                        ? <CheckCircle className="w-3 h-3 text-white"/>
                        : <Icon className={`w-2.5 h-2.5 ${curr ? stage.color : 'text-slate-300'}`}/>}
                    </div>
                    <span className={`text-xs font-bold ${isViewing ? 'text-navy' : curr ? 'text-slate-900' : done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{stage.label}</span>
                    {isViewing && <span className="ml-auto text-xs font-black text-slate-600">VIEWING</span>}
                    {curr && !isViewing && <span className="ml-auto text-xs font-black text-navy">ACTIVE</span>}
                    {done && !isViewing && <span className="ml-auto text-xs text-slate-300 font-bold">↩</span>}
                  </div>
                );
              })}
              {isTerminal && (
                <div className={`flex items-center gap-2.5 py-2 px-3 rounded-lg mt-1 ${batch.status==='released'?'bg-emerald-50 border border-emerald-200':'bg-red-50 border border-red-200'}`}>
                  {batch.status==='released'?<CheckCircle className="w-4 h-4 text-emerald-600"/>:<XCircle className="w-4 h-4 text-red-600"/>}
                  <span className={`text-xs font-black uppercase ${batch.status==='released'?'text-emerald-700':'text-red-700'}`}>{batch.status}</span>
                </div>
              )}
            </div>
          </div>

          {/* Flask Cards */}
          <div className="card p-4 border-2 border-navy/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-navy/5 rounded-bl-[100px] -z-10"/>
            <p className="text-xs font-black text-navy uppercase tracking-widest mb-3 flex items-center gap-1"><FlaskConical className="w-3 h-3"/>Trials Tracking</p>
            <div className="space-y-2">
              {flasks.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFlaskId(f.id); setViewingStage(null); }}
                  disabled={!isPostSterilisation}
                  className={`w-full p-2.5 rounded-xl text-left border transition-all flex flex-col items-start ${selectedFlaskId===f.id?'bg-navy/5 border-navy shadow-sm ring-1 ring-navy':f.status==='rejected'?'bg-red-50 border-red-200 opacity-60':'bg-white hover:bg-slate-50 border-slate-200 hover:border-navy/50'}`}>
                  <div className="flex justify-between items-center w-full">
                    <p className={`text-sm font-black ${f.status==='rejected'?'text-red-500 line-through':selectedFlaskId===f.id?'text-navy':'text-slate-700'}`}>{f.flask_label}</p>
                    {selectedFlaskId===f.id && <div className="w-1.5 h-1.5 bg-navy rounded-full animate-pulse"/>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <p className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${f.status==='rejected'?'bg-red-100 text-red-600':selectedFlaskId===f.id?'bg-navy text-white':'bg-slate-200 text-slate-500'}`}>
                      {f.status==='rejected' ? 'REJECTED' : ((STAGES.find(s => s.id === visibleWorkflowStage(f.current_stage))?.label) || visibleWorkflowStage(f.current_stage) || 'INOCULATION').toUpperCase()}
                    </p>
                    {lnbByFlask[f.id] > 0 && (
                      <span className="text-xs font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 flex items-center gap-0.5">
                        <BookOpen className="w-2.5 h-2.5"/>{lnbByFlask[f.id]}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Linked Records (compact — Lab Notebook + BMR only) */}
          <div className="card p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Quick Links</p>
            <div className="space-y-2">
              <Link href={lnbEntryId ? `/lab-notebook/${lnbEntryId}` : '/lab-notebook'} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-slate-400"/><span className="text-xs font-semibold text-slate-700">Lab Notebook</span></div>
                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${lnbCount>0?'bg-navy text-white':'bg-slate-200 text-slate-500'}`}>{lnbCount}</span>
              </Link>

              {['qc_hold','released','rejected'].includes(batch?.current_stage) && (
                <div className="space-y-2">
                  <button
                    onClick={handleExportBMR}
                    disabled={bmrLoading}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-navy/5 hover:bg-navy/10 border border-navy/15 transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      {bmrLoading ? <Loader className="w-3.5 h-3.5 text-navy animate-spin"/> : <FileText className="w-3.5 h-3.5 text-navy"/>}
                      <span className="text-xs font-black text-navy">{bmrLoading ? 'Generating…' : bmrUrl ? 'Regenerate BMR' : 'Export BMR PDF'}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">GMP</span>
                  </button>
                  {bmrUrl && (
                    <a href={`/api/batches/${batchId}/bmr?download=true`} target="_blank"
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      <div className="flex items-center gap-2"><Download className="w-3.5 h-3.5 text-emerald-600"/><span className="text-xs font-black text-emerald-700">Download BMR</span></div>
                      <span className="text-xs font-bold text-emerald-500 uppercase">PDF</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stage History */}
          <div className="card p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Stage History</p>
            <div className="space-y-2.5">
              {transitions.length===0 && <p className="text-xs text-slate-400 text-center py-2">No transitions yet.</p>}
              {(() => {
                const asc = [...transitions].sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
                return asc.map((t, i) => {
                  const next = asc[i+1];
                  const ms = next ? new Date(next.created_at)-new Date(t.created_at) : null;
                  const h  = ms ? Math.floor(ms/3600000) : null;
                  const m  = ms ? Math.floor((ms%3600000)/60000) : null;
                  const dur = h !== null ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : null;
                  return (
                    <div key={t.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 bg-navy rounded-full mt-1.5 shrink-0"/>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-700">{t.from_stage?.replace(/_/g,' ')} → {t.to_stage?.replace(/_/g,' ')}</p>
                          {dur && <span className="text-xs font-black text-navy bg-navy/5 px-1.5 py-0.5 rounded">{dur}</span>}
                        </div>
                        <p className="text-slate-400 text-xs">{t.employees?.full_name} · {t.created_at ? new Date(t.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Stage Panel (shows first on mobile) ── */}
        <div className="order-1 lg:order-2" ref={stagePanelRef}>
          {/* View / Edit Mode Banner */}
          {viewingStage && (
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 mb-4 ${editingStage === viewingStage ? 'bg-amber-50 border border-amber-300' : 'bg-slate-50 border border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <BookOpen className={`w-4 h-4 shrink-0 ${editingStage === viewingStage ? 'text-amber-600' : 'text-slate-600'}`}/>
                <div>
                  {editingStage === viewingStage ? (
                    <>
                      <p className="text-xs font-black text-amber-800">Editing Past Stage — Admin Mode</p>
                      <p className="text-xs text-amber-600">Editing <span className="font-bold uppercase">{viewingStage.replace(/_/g,' ')}</span> data. Save within the panel to update.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-black text-slate-800">Viewing Past Stage — Read Only</p>
                      <p className="text-xs text-slate-600">You are reviewing <span className="font-bold uppercase">{viewingStage.replace(/_/g,' ')}</span> data. No edits can be made.</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {['admin','ceo','cto'].includes(role) && editingStage !== viewingStage && (
                  <button
                    onClick={() => setEditingStage(viewingStage)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-lg transition-colors"
                  >
                    Edit Stage
                  </button>
                )}
                {editingStage === viewingStage && (
                  <button
                    onClick={() => {
                      if (window.confirm('Have you clicked Save inside the panel? Stop Editing does not save your changes — anything not saved will be lost.')) {
                        setEditingStage(null);
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Stop Editing
                  </button>
                )}
                <button
                  onClick={() => {
                    if (editingStage === viewingStage && !window.confirm('Have you clicked Save inside the panel? Leaving now discards any unsaved changes.')) {
                      return;
                    }
                    setViewingStage(null);
                    setEditingStage(null);
                  }}
                  className="px-3 py-1.5 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover transition-colors"
                >
                  ← Return to Current Stage
                </button>
              </div>
            </div>
          )}

          {!viewingStage && isPostSterilisation && selectedFlask && !['released','rejected'].includes(selectedFlask.current_stage) && selectedFlask.status !== 'rejected' && (
            <div className="flex justify-end mb-4">
              <button onClick={() => setPendingFlaskReject(true)} className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 font-black rounded-lg text-xs uppercase tracking-wider transition-all hover:scale-105">Abort / Reject Trial {selectedFlask.flask_label}</button>
            </div>
          )}

          {globalError && (
            <div className="bg-red-50 text-red-700 border-2 border-red-500 rounded-xl p-4 shadow-sm mb-6 flex flex-col gap-2 relative animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-black uppercase tracking-wider text-red-800">Action Failed</h3>
                  <p className="text-sm font-semibold mt-1">{globalError}</p>
                </div>
                <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-red-100 rounded-md transition-colors text-red-500">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {CurrentPanel ? (
            <div
              key={`${selectedFlaskId ?? 'batch'}-${displayStage}`}
              className={viewingStage && editingStage !== viewingStage ? 'pointer-events-none opacity-90 select-none' : ''}
            >
              <ErrorBoundary>
                <CurrentPanel
                  batch={{...batch, current_stage: normalizeStage(batch.current_stage)}}
                  flasks={flasks.map(f => ({...f, current_stage: normalizeStage(f.current_stage)}))}
                  activeFlask={selectedFlask}
                  employees={employees}
                  availableStock={availableStock}
                  role={role}
                  canDo={canDo}
                  employeeProfile={employeeProfile}
                  supabase={supabase}
                  onDataSaved={fetchAll}
                  onAdvanceStage={handleDirectTransition}
                  onAdvanceFlaskStage={selectedFlask ? (toStage, warnings) => handleFlaskTransition(selectedFlask.id, toStage, warnings) : null}
                  actionLoading={actionLoading}
                  setGlobalError={setGlobalError}
                  readOnly={!!viewingStage && editingStage !== viewingStage}
                  batchId={batchId}
                />
              </ErrorBoundary>
            </div>
          ) : displayStage && isUpstreamStage(displayStage) ? (
            <div className="card p-8 text-center bg-slate-50 border-slate-200">
              <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-black text-slate-700 mb-2">Upstream Stage</h3>
              <p className="text-sm text-slate-500 mb-6">
                {selectedFlask ? <>Trial <span className="font-bold text-slate-700">{selectedFlask.flask_label}</span> is</> : 'This batch is'} currently in <span className="font-bold text-slate-700 uppercase">{displayStage.replace('_', ' ')}</span>. Data collection for this stage is managed in the Batches module.
              </p>
              <Link href={`/batches/${batch.id}${selectedFlask ? `?flask=${selectedFlask.id}` : ''}`} className="inline-flex items-center px-6 py-2.5 bg-navy text-white text-sm font-black rounded-xl hover:bg-navy-hover transition-colors shadow-sm">
                Open in Batches Module <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          ) : (
            <div className="card p-8 text-center text-slate-400 text-sm">Unknown stage: {normalizeStage(batch.current_stage) || batch.current_stage}</div>
          )}
        </div>
      </div>

      {/* Linked Records — full-width cross-module panel */}
      <LinkedRecordsPanel batch={batch} />

      {/* Archive Modal */}
      {pendingCancel && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">Archive Entire Batch</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">This hides the batch from active lists. Permanent delete is available only from Archived.</p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Archiving</label>
              <input
                type="text"
                placeholder="Required..."
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-red-500"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingCancel(false)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold">Nevermind</button>
              <button disabled={!archiveReason.trim()} onClick={confirmCancelBatch} className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-sm">Archive Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* Flask Advance Confirmation Modal */}
      {pendingFlaskAdvance && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-1 text-center">Advance Trial Stage</h3>
            <p className="text-sm text-slate-600 mb-1 text-center">
              Advancing <span className="font-black text-navy">{pendingFlaskAdvance.flaskLabel}</span> to{' '}
              <span className="font-black uppercase">{pendingFlaskAdvance.toStage.replace(/_/g,' ')}</span>
            </p>
            <p className="text-xs text-slate-400 text-center mb-5">This cannot be undone without admin intervention.</p>
            {pendingFlaskAdvance.warnings?.length > 0 && (
              <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-3 text-xs font-bold mb-3">
                <p className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 shrink-0" /> Incomplete data:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {pendingFlaskAdvance.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
                <label className="block mt-2 text-xs font-black text-slate-700 uppercase tracking-wider">Reason to proceed anyway (required)</label>
                <textarea
                  value={flaskAdvanceReason}
                  onChange={(e) => setFlaskAdvanceReason(e.target.value)}
                  className="field-input mt-1 text-xs"
                  rows={2}
                  placeholder="Why is it OK to advance without this data?"
                />
              </div>
            )}
            {globalError && (
              <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg p-3 text-sm font-bold flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {globalError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setPendingFlaskAdvance(null); setGlobalError(null); }} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition">Cancel</button>
              <button onClick={confirmFlaskAdvance} disabled={actionLoading || (pendingFlaskAdvance.warnings?.length > 0 && !flaskAdvanceReason.trim())} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {actionLoading ? <Loader className="w-4 h-4 animate-spin"/> : `Advance ${pendingFlaskAdvance.flaskLabel}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Trial Modal */}
      {pendingFlaskReject && selectedFlask && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">Abort & Reject Trial</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Are you sure you want to forcibly reject <strong>{selectedFlask.flask_label}</strong> at its current stage? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingFlaskReject(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
              >
                Nevermind
              </button>
              <button
                onClick={() => { setPendingFlaskReject(false); handleFlaskTransition(selectedFlask.id, 'rejected'); }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm"
              >
                Yes, Reject Trial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
