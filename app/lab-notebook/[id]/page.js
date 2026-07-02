'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { Loader2, ArrowLeft, Save, FileCheck, FileSignature, BookOpen, Clock, AlertCircle, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EditRequestButton from '@/components/ui/EditRequestButton';
import { markdownToHtml } from '@/utils/markdown';
import BlockEditor from '@/components/lnb/BlockEditor';

export default function LnbEntryPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [pendingSubmitReview, setPendingSubmitReview] = useState(false);
  const [pendingCountersign, setPendingCountersign] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());

  // Form mutable states
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [methodology, setMethodology] = useState('');
  const [observations, setObservations] = useState('');
  const [conclusions, setConclusions] = useState('');
  const [stageSnapshots, setStageSnapshots] = useState({});
  // Lookup map: formulation UUID → "CODE — Name" for display in snapshots
  const [formulationMap, setFormulationMap] = useState({});

  const supabase = useMemo(() => createClient(), []);

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`);
      const logsRes = await res.json();
      if (!logsRes.success) throw new Error(logsRes.error || 'Failed to fetch entry');
      
      const data = logsRes.data;
      setEntry(data);
      setTitle(data.title || '');
      setObjective(data.objective || '');
      setMethodology(data.methodology || '');
      setObservations(data.observations || '');
      setConclusions(data.conclusions || '');
      setStageSnapshots(data.stage_snapshots || {});
    } catch (err) {
      console.error(err);
      toast.error('Experiment not found.');
      router.push('/lab-notebook');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    if (id) fetchEntry();
  }, [id, fetchEntry]);

  useEffect(() => {
    fetch('/api/edit-request').then(res => res.ok ? res.json() : null).then(d => {
      if (d?.data) setPendingIds(new Set(d.data.filter(r => r.status === 'pending').map(r => r.record_id)));
    });
  }, [id]);

  // Load formulations lookup once to resolve UUIDs in stage snapshots
  useEffect(() => {
    supabase.from('formulations').select('id, code, name').then(({ data }) => {
      if (!data) return;
      const map = {};
      data.forEach(f => { map[f.id] = `${f.code} — ${f.name}`; });
      setFormulationMap(map);
    });
  }, [supabase]);

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, objective, methodology, observations, conclusions })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchEntry();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleSubmitReview = () => {
    setPendingSubmitReview(true);
  };

  const confirmSubmitReview = async () => {
    setPendingSubmitReview(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, objective, methodology, observations, conclusions, status: 'Submitted' })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchEntry();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleCountersign = () => {
    setPendingCountersign(true);
  };

  const confirmCountersign = async () => {
    setPendingCountersign(false);
    setSigning(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'countersign' })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchEntry();
    } catch (err) { toast.error(err.message); }
    finally { setSigning(false); }
  };

  const handleDeleteDraftClick = () => {
    setConfirmDelete(true);
  };

  const executeDeleteDraft = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete');
      toast.success('Draft entry deleted');
      router.push('/lab-notebook');
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="page-container max-w-5xl mx-auto space-y-8">
        <Skeleton width={150} height={20} className="mb-4"/>
        <div className="flex justify-between items-center"><Skeleton width={300} height={40}/> <Skeleton width={200} height={48}/></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-40 w-full rounded-2xl"/>
            <Skeleton className="h-64 w-full rounded-2xl"/>
          </div>
          <Skeleton className="h-80 w-full rounded-2xl"/>
        </div>
      </div>
    );
  }
  if (!entry || !employeeProfile) return null;

  const isDraft = entry.status === 'Draft';
  const isAuthor = entry.author?.id === employeeProfile.id;
  const isAdmin = ['admin', 'ceo'].includes(String(employeeProfile.role || '').toLowerCase());
  const canEdit = isDraft && (isAuthor || isAdmin);
  const canDelete = canEdit;
  const canCountersign = entry.status === 'Submitted' && 
                         (employeeProfile.role === 'admin' || employeeProfile.role === 'research_fellow') && 
                         entry.author?.id !== employeeProfile.id;

  return (
    <div className="page-container text-slate-900 max-w-5xl mx-auto">
      <Link href="/lab-notebook" className="flex items-center text-xs font-bold text-slate-400 hover:text-navy transition-colors mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Notebook
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex-1 w-full">
          {canEdit ? (
             <input 
               type="text" value={title} onChange={(e) => setTitle(e.target.value)} 
               className="text-3xl font-black text-slate-900 tracking-tight w-full bg-transparent border-b border-transparent hover:border-slate-200 outline-none focus:border-navy transition-colors pb-1"
               placeholder="Experiment Title..."
             />
          ) : (
             <h1 className="text-3xl font-black text-slate-900 tracking-tight">{entry.title}</h1>
          )}
          
          <div className="flex flex-wrap items-center gap-4 mt-3">
             <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg">
                <span className={
                  entry.status === 'Draft' ? 'text-amber-600' : 
                  entry.status === 'Submitted' ? 'text-slate-600' : 'text-emerald-600'
                }>{entry.status}</span>
             </div>
             {entry.batches && (
               <div className="flex items-center text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Batch: {entry.batches.batch_id}
               </div>
             )}
             {entry.cell_bank_preparations && (
               <div className="flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                  <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Cell Bank: {entry.cell_bank_preparations.prep_code}
               </div>
             )}
             <div className="flex items-center text-xs font-bold text-slate-500">
                <Clock className="w-3.5 h-3.5 mr-1.5" /> {new Date(entry.created_at).toLocaleString()}
             </div>
          </div>
        </div>

        <div className="flex gap-3">
          {canEdit && (
            <>
              <button disabled={saving || deleting} onClick={handleSaveDraft} className="flex items-center px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all">
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} Save Draft
              </button>
              <button disabled={saving || deleting} onClick={handleSubmitReview} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all shadow-sm">
                <FileCheck className="w-4 h-4 mr-1.5" /> Submit for Review
              </button>
            </>
          )}
          {isAdmin && canDelete && (
            <button disabled={saving || deleting} onClick={handleDeleteDraftClick} className="flex items-center px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-red-100 transition-all shadow-sm border border-red-100">
              {deleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : 'Delete LNB'}
            </button>
          )}
          {!isAdmin && canEdit && (
            <EditRequestButton
              tableName="lab_notebook_entries"
              recordId={entry.id}
              moduleLabel="Lab Notebook"
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'objective', label: 'Objective', type: 'textarea' },
                { key: 'methodology', label: 'Methodology', type: 'textarea' },
              ]}
              currentData={{ title, objective, methodology }}
              hasPending={pendingIds.has(entry.id)}
              allowDelete
              onSuccess={fetchEntry}
            />
          )}
          {canCountersign && (
            <button disabled={signing} onClick={handleCountersign} className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm">
              {signing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSignature className="w-4 h-4 mr-1.5" />} Countersign Document
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Main Notebook Content */}
        <div className="md:col-span-2 space-y-6">
           <StageLogPanel
             snapshots={stageSnapshots}
             formulationMap={formulationMap}
             entryId={id}
             role={employeeProfile.role}
             onResync={fetchEntry}
           />
           <SectionBox title="Objective" icon={<AlertCircle className="w-4 h-4" />} canEdit={canEdit} value={objective} onChange={setObjective} placeholder="State the purpose of this experiment..." />
           <SectionBox title="Methodology / Protocols" icon={<BookOpen className="w-4 h-4" />} canEdit={canEdit} value={methodology} onChange={setMethodology} placeholder="Detail the steps, reagents, and equipment used..." isLarge />
           
           <div className="card p-0 overflow-hidden border border-slate-200 shadow-sm rounded-2xl bg-white">
             <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-2">
               <div className="text-navy"><FileCheck className="w-4 h-4" /></div>
               <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Detailed Observations</h3>
             </div>
             <div className="p-4 bg-slate-50/30">
               <BlockEditor value={observations} onChange={setObservations} canEdit={canEdit} />
             </div>
           </div>
           
           <SectionBox title="Conclusions" icon={<FileSignature className="w-4 h-4" />} canEdit={canEdit} value={conclusions} onChange={setConclusions} placeholder="Summarize findings and next steps..." />
        </div>

        {/* Sidebar Signatures */}
        <div className="space-y-6">
           <div className="card p-5 border border-slate-100 rounded-2xl bg-white shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 tracking-[0.2em] mb-4 uppercase">Chain of Custody</h3>
              
              <div className="mb-6">
                 <p className="text-xs font-bold text-slate-500 uppercase mb-2">Primary Author</p>
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                       <FileSignature className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-sm font-bold text-slate-900">{entry.author?.full_name}</p>
                       <p className="text-xs font-semibold text-slate-500">{entry.author?.role}</p>
                    </div>
                 </div>
              </div>

              <div className="pt-5 border-t border-slate-100">
                 <p className="text-xs font-bold text-slate-500 uppercase mb-2">Countersigned By</p>
                 {entry.countersigner ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
                         <FileCheck className="w-5 h-5" />
                      </div>
                      <div>
                         <p className="text-sm font-bold text-slate-900">{entry.countersigner.full_name}</p>
                         <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{new Date(entry.countersigned_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                 ) : (
                    <div className="flex items-center gap-3 opacity-50">
                       <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-slate-300" />
                       </div>
                       <p className="text-xs font-bold text-slate-400 italic">Pending Review...</p>
                    </div>
                 )}
              </div>
           </div>
        </div>

      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={executeDeleteDraft}
        title="Delete Draft Entry"
        message="Are you sure you want to delete this draft entry? This cannot be undone."
        confirmText="Delete"
        variant="danger"
      />

      {/* Submit Review Modal */}
      {pendingSubmitReview && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Submit for Review</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">
              Are you sure you want to submit? Once submitted, this notebook entry will be locked for review and you can no longer edit it.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingSubmitReview(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmSubmitReview}
                className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover transition w-full"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Countersign Modal */}
      {pendingCountersign && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Countersign Document</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">
              By countersigning, you legally verify this document&apos;s contents and attest to its accuracy. Proceed?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingCountersign(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmCountersign}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition w-full"
              >
                ✓ Countersign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TOOLBAR_TOOLS = [
  { label: 'B',  title: 'Bold',          cls: 'font-black',  wrap: ['**', '**'] },
  { label: 'I',  title: 'Italic',         cls: 'italic',      wrap: ['*', '*'] },
  { label: '`',  title: 'Inline code',    cls: 'font-mono',   wrap: ['`', '`'] },
  { label: '==', title: 'Highlight',      cls: '',            wrap: ['==', '=='] },
  { sep: true },
  { label: 'H2', title: 'Heading 2',      cls: 'font-bold',   line: '## ' },
  { label: 'H3', title: 'Heading 3',      cls: 'font-bold',   line: '### ' },
  { sep: true },
  { label: '•',  title: 'Bullet list',    cls: '',            line: '- ' },
  { label: '1.', title: 'Numbered list',  cls: '',            line: '1. ' },
  { label: '❝',  title: 'Blockquote',     cls: '',            line: '> ' },
  { sep: true },
  { label: '—',  title: 'Divider',        cls: '',            block: '---' },
];

function RichToolbar({ taRef, value, onChange }) {
  const apply = (tool) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;

    if (tool.wrap) {
      const [before, after] = tool.wrap;
      const sel = value.slice(start, end) || 'text';
      const next = value.slice(0, start) + before + sel + after + value.slice(end);
      onChange(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + sel.length); }, 0);
    } else if (tool.line) {
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      const next = value.slice(0, lineStart) + tool.line + value.slice(lineStart);
      onChange(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(lineStart + tool.line.length, lineStart + tool.line.length); }, 0);
    } else if (tool.block) {
      const nl = start === 0 || value[start - 1] === '\n' ? '' : '\n';
      const next = value.slice(0, start) + nl + tool.block + '\n' + value.slice(end);
      onChange(next);
      setTimeout(() => ta.focus(), 0);
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex-wrap">
      {TOOLBAR_TOOLS.map((t, i) =>
        t.sep ? (
          <div key={i} className="w-px h-3.5 bg-slate-200 mx-1 shrink-0" />
        ) : (
          <button
            key={i}
            type="button"
            title={t.title}
            onMouseDown={(e) => { e.preventDefault(); apply(t); }}
            className={`px-2 py-1 rounded text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors select-none ${t.cls}`}
          >
            {t.label}
          </button>
        )
      )}
      <span className="ml-auto text-[9px] font-bold text-slate-300 uppercase tracking-widest hidden sm:block">Markdown</span>
    </div>
  );
}

function SectionBox({ title, icon, canEdit, value, onChange, placeholder, isLarge }) {
  const taRef = useRef(null);
  const html  = value ? markdownToHtml(value) : '';

  return (
    <div className="card p-0 overflow-hidden border border-slate-200 shadow-sm rounded-2xl bg-white">
      <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <div className="text-navy">{icon}</div>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{title}</h3>
      </div>
      {canEdit && <RichToolbar taRef={taRef} value={value} onChange={onChange} />}
      <div className="p-1">
        {canEdit ? (
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full p-4 bg-transparent outline-none resize-none text-sm font-medium text-slate-700 leading-relaxed font-mono ${isLarge ? 'min-h-[14rem]' : 'min-h-[8rem]'}`}
            placeholder={placeholder}
          />
        ) : (
          <div className={`w-full px-5 py-4 overflow-y-auto prose prose-sm max-w-none ${isLarge ? 'min-h-[10rem]' : 'min-h-[5rem]'}`}>
            {html
              ? <div dangerouslySetInnerHTML={{ __html: html }} />
              : <span className="text-slate-400 italic text-sm">No {title.toLowerCase()} recorded.</span>
            }
          </div>
        )}
      </div>
    </div>
  );
}

const STAGE_META = [
  { key: 'preparation',    label: 'Cell Bank Preparation', color: 'emerald', perFlask: false },
  { key: 'strain_source',  label: 'Strain Source',         color: 'emerald', perFlask: false },
  { key: 'broth_culture_1', label: 'Broth Culture #1',     color: 'slate',    perFlask: false },
  { key: 'colony_pick',    label: 'Colony Pick',           color: 'indigo',  perFlask: false },
  { key: 'broth_culture_2', label: 'Broth Culture #2',     color: 'slate',    perFlask: false },
  { key: 'glycerol_stock', label: 'Glycerol Stock',        color: 'blue',    perFlask: false },
  { key: 'vial_storage',   label: 'Vial Registration',     color: 'blue',    perFlask: false },
  { key: 'completion',     label: 'Preparation Completion', color: 'emerald', perFlask: false },
  { key: 'media_prep',    label: 'Media Preparation',      color: 'amber',   perFlask: false },
  { key: 'sterilisation', label: 'Sterilisation',           color: 'blue',    perFlask: false },
  { key: 'inoculation',   label: 'Inoculation',             color: 'indigo',  perFlask: true  },
  { key: 'fermentation',  label: 'Fermentation Endpoint',   color: 'slate',    perFlask: true  },
  { key: 'qc',            label: 'QC Hold',                 color: 'emerald', perFlask: true  },
  { key: 'plating',       label: 'Plating Results',         color: 'slate',    perFlask: true  },
  { key: 'sample_incubation', label: 'Sample Incubation',    color: 'blue',    perFlask: true  },
];

const FIELD_LABELS = {
  ragi_lot_id: 'Ragi Lot ID', ragi_weight_g: 'Ragi Weight (g)', ragi_moisture: 'Ragi Moisture Check',
  kavuni_lot_id: 'Kavuni Lot ID', kavuni_weight_g: 'Kavuni Weight (g)',
  kavuni_precook_temp_c: 'Kavuni Precook Temp (°C)', kavuni_precook_min: 'Precook Time (min)',
  water_volume_ml: 'Water Vol (ml)', total_volume_ml: 'Total Vol (ml)', initial_ph: 'Initial pH',
  method: 'Sterilisation Method', equipment: 'Equipment Used',
  cycle_temp_c: 'Cycle Temp (°C)', cycle_pressure_bar: 'Pressure (bar)', hold_time_min: 'Hold Time (min)',
  autoclave_tape: 'Autoclave Tape Result', pass_fail: 'Pass / Fail',
  inoculum_source: 'Inoculum Source', inoculum_vol_ml: 'Inoculum Vol (ml)',
  planned_fermentation_hrs: 'Planned Fermentation (hrs)', t_zero_time: 'T=0 Time',
  transfer_method: 'Transfer Method', laf_used: 'LAF Used', contamination_check: 'Contamination Check',
  total_hours: 'Total Fermentation (hrs)', final_ph: 'Final pH', aroma: 'Aroma',
  colour_desc: 'Colour Description', texture: 'Texture', sensory_overall: 'Sensory Overall',
  gram_stain: 'Gram Stain', sample_id: 'QC Sample ID',
  sterility_status: 'Sterility Status', colony_count: 'Colony Count',
  cfu_per_ml: 'CFU / ml', colony_morphology: 'Colony Morphology',
  microscopic_morphology: 'Microscopic Morphology', observation: 'Final Observation',
  completed_at: 'Incubation Completed At',
  sample_name: 'Sample Name', sample_category: 'Sample Category', sample_type: 'Sample Type',
  source_stage: 'Source Stage', source_type: 'Source Type', incubation_date: 'Incubation Date',
  incubation_temp_c: 'Incubation Temp (C)', start_time: 'Start Time', end_time: 'End Time',
  od_value: 'OD Value', ph_value: 'pH Value', staining_method: 'Staining Method',
  type: 'Type', status: 'Status', strain_id: 'Strain ID', parent_id: 'Parent Prep',
  formulation_id: 'Recipe ID', started_at: 'Started At', culture_condition: 'Culture Condition',
  date_revived: 'Date Revived', observations: 'Observations', media: 'Media',
  media_formulation_id: 'Media Recipe ID', volume_ml: 'Volume (ml)',
  sterilization_method: 'Sterilization Method', sterilization_temp: 'Sterilization Temp (C)',
  sterilization_min: 'Sterilization Time (min)', media_ph_after: 'Media pH After Prep',
  media_lot_notes: 'Media Lot Notes', incubation_temp: 'Incubation Temp (C)',
  duration_h: 'Duration (h)', od_600: 'OD 600nm', od_target_reached: 'Target OD Reached',
  agar_media: 'Agar Media', agar_formulation_id: 'Agar Recipe ID', plates_poured: 'Plates Poured',
  agar_sterilization_method: 'Agar Sterilization Method', agar_batch_notes: 'Agar Batch Notes',
  dilution: 'Dilution', incubation_hours: 'Incubation Hours',
  colony_observations: 'Colony Observations', picked_colony_id: 'Picked Colony ID',
  pick_reason: 'Pick Reason', glycerol_percent: 'Glycerol (%)', vial_count: 'Vial Count',
  storage_temp: 'Storage Temp', freezer_id: 'Freezer ID', rack: 'Rack', box: 'Box',
  vial_codes: 'Vial Codes',
};

// Keys that hold formulation UUIDs — resolved via formulationMap
const FORMULATION_KEYS = new Set(['formulation_id', 'media_formulation_id', 'agar_formulation_id']);

function SnapshotRows({ data, formulationMap = {} }) {
  const skip = new Set(['synced_at', 'tests', 'notes']);
  return (
    <div className="space-y-1.5">
      {Object.entries(data)
        .filter(([k, v]) => !skip.has(k) && v != null && v !== '')
        .map(([key, value]) => {
          const display = FORMULATION_KEYS.has(key) && typeof value === 'string' && formulationMap[value]
            ? formulationMap[value]
            : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
          return (
            <div key={key} className="flex items-start justify-between gap-3 min-w-0">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide shrink-0 mt-0.5 min-w-[80px]">
                {FIELD_LABELS[key] || key.replace(/_/g, ' ')}
              </span>
              <span className="text-xs font-bold text-slate-700 text-right break-words min-w-0 flex-1">
                {display}
              </span>
            </div>
          );
        })}
      {data.tests && (
        <div className="mt-2 space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-1">QC Test Results</p>
          {data.tests.map((t, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs py-0.5 border-b border-slate-50 last:border-0">
              <span className="text-slate-600 break-words flex-1">{t.test}</span>
              <span className={`font-black ml-2 shrink-0 ${t.pass_fail === 'Pass' ? 'text-emerald-600' : t.pass_fail === 'Fail' ? 'text-red-600' : 'text-slate-400'}`}>
                {t.result ? `${t.result} ` : ''}{t.pass_fail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageBlock({ label, data, perFlask, colorKey, formulationMap }) {
  const [open, setOpen] = useState(true);
  const colorMap = {
    amber:   'bg-amber-50  border-amber-100  text-amber-700',
    blue:    'bg-slate-50   border-slate-100   text-slate-700',
    indigo:  'bg-slate-50 border-slate-100 text-slate-700',
    slate:    'bg-slate-50   border-slate-100   text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  };
  const headerClass = colorMap[colorKey] || colorMap.slate;
  const syncDate = perFlask
    ? Object.values(data)[0]?.synced_at
    : data.synced_at;

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full px-4 py-2.5 flex items-center justify-between border-b border-slate-100 ${open ? headerClass : 'bg-slate-50 text-slate-600'} transition-colors`}
      >
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-2">
          {syncDate && <span className="text-[9px] opacity-60">{new Date(syncDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>}
          {open ? <ChevronUp className="w-3.5 h-3.5 opacity-60" /> : <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3">
          {perFlask ? (
            <div className="space-y-4">
              {Object.entries(data).map(([flask, flaskData]) => (
                <div key={flask}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-50 pb-1">Trial {flask}</p>
                  <SnapshotRows data={flaskData} formulationMap={formulationMap} />
                </div>
              ))}
            </div>
          ) : (
            <SnapshotRows data={data} formulationMap={formulationMap} />
          )}
        </div>
      )}
    </div>
  );
}

function StageLogPanel({ snapshots, formulationMap = {}, entryId, role, onResync }) {
  const [resyncing, setResyncing] = useState(false);
  const toast = useToast();
  const present = STAGE_META.filter(s => snapshots[s.key] && Object.keys(snapshots[s.key]).length > 0);
  const canResync = ['admin', 'research_fellow', 'ceo'].includes(role);

  const handleResync = async () => {
    setResyncing(true);
    try {
      const res = await fetch(`/api/lab-notebook/${entryId}/resync`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Re-synced flasks: ${json.synced_flasks.join(', ')}`);
      onResync?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResyncing(false);
    }
  };

  if (present.length === 0 && !canResync) return null;
  return (
    <div className="card rounded-2xl border border-slate-100 bg-slate-50/20 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-slate-500" />
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest">Auto-Synced Stage Data</h3>
        <span className="ml-auto text-[9px] font-semibold text-slate-400">Read-only · Updated as stages complete</span>
        {canResync && (
          <button
            onClick={handleResync}
            disabled={resyncing}
            className="ml-2 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {resyncing ? 'Syncing...' : 'Re-sync Flasks'}
          </button>
        )}
      </div>
      {present.length > 0 && (
        <div className="p-4 space-y-3">
          {present.map(({ key, label, color, perFlask }) => {
            const data = snapshots[key];
            const isActuallyPerFlask = perFlask && Object.values(data).every(value => (
              value && typeof value === 'object' && !Array.isArray(value)
            ));
            return <StageBlock key={key} label={label} data={data} perFlask={isActuallyPerFlask} colorKey={color} formulationMap={formulationMap} />;
          })}
        </div>
      )}
    </div>
  );
}
