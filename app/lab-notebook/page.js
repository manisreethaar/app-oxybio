'use client';
import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { withTimeout, withRetry } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { BookOpen, Loader2, FileSignature, ChevronRight, FlaskConical, Sparkles, X, Paperclip, Upload, Activity, Search, ArrowUpDown, SortAsc, SortDesc, Microscope, CheckCircle, History } from 'lucide-react';
import CreatorBadge from '@/components/ui/CreatorBadge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Skeleton from '@/components/Skeleton';
import ESignatureModal from '@/components/ui/ESignatureModal';
import { useData } from '@/lib/hooks/useData';

const STAGE_LABELS = {
  media_prep: 'Media Prep', sterilisation: 'Sterilisation', inoculation: 'Inoculation',
  fermentation: 'Fermentation', straining: 'Centrifugation', extract_addition: 'Extract Addition',
  qc_hold: 'QC Hold', cell_bank: 'Cell Bank',
};

export default function DigitalLnbPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [entries,     setEntries]     = useState([]);
  const [batches,     setBatches]     = useState([]);
  const [batchFlasks, setBatchFlasks] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [showNew,     setShowNew]     = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [selectedFlaskId,  setSelectedFlaskId]  = useState('');
  const [selectedStage,    setSelectedStage]    = useState('');
  const [searchTerm,       setSearchTerm]       = useState('');
  const debouncedSearchTerm = useDeferredValue(searchTerm);
  const [sortOrder,        setSortOrder]        = useState('newest'); // newest, oldest, status
  const [filterGroup,      setFilterGroup]      = useState('all'); // all, cell_bank, fermentation
  const [pendingIds,       setPendingIds]       = useState(new Set());
  // G-24: countersign
  const [countersigning, setCountersigning] = useState(null); // entry id
  
  // E-Signature state
  const [esigConfig, setEsigConfig] = useState({ isOpen: false, entryId: null });
  // G-25: new version prefill
  const [versionSourceEntry, setVersionSourceEntry] = useState(null);
  
  const { data: sopsData } = useData({
    table: 'sop_library',
    select: 'id, title, sop_id',
    filter: { eq: ['is_active', true] },
    order: { column: 'title' }
  });
  const sops = sopsData || [];
  
  const [sopIds,           setSopIds]           = useState([]);
  // G-90: sketch/diagram URL
  const [sketchUrl,        setSketchUrl]        = useState('');

  const fileRef = useRef(null);
  const supabase = useMemo(() => createClient(), []);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      title:               z.string().min(3, 'Experiment title is required'),
      batch_id:            z.string().optional(),
      hypothesis:          z.string().optional(),
      direct_observations: z.string().optional(),
    })),
    defaultValues: { title: '', batch_id: '', hypothesis: '', direct_observations: '' }
  });

  const watchedBatchId = watch('batch_id');
  const currentTitle   = watch('title');

  // When batch changes in form, load its flasks and reset flask/stage selection
  useEffect(() => {
    setSelectedFlaskId('');
    setSelectedStage('');
    if (!watchedBatchId) { setBatchFlasks([]); return; }
    supabase.from('batch_flasks').select('id, flask_label').eq('batch_id', watchedBatchId).order('flask_label')
      .then(({ data }) => setBatchFlasks(data || []));
  }, [watchedBatchId, supabase]);

  // Search is deferred via useDeferredValue

  useEffect(() => {
    if (currentTitle && currentTitle.length > 5) {
      const tags = [];
      const t = currentTitle.toLowerCase();
      if (t.includes('yield'))   tags.push('#Performance');
      if (t.includes('trial') || t.includes('test')) tags.push('#Experimental');
      if (t.includes('formula')) tags.push('#Scientific');
      if (t.includes('optimize')) tags.push('#R&D');
      setSuggestedTags(tags);
    } else {
      setSuggestedTags([]);
    }
  }, [currentTitle]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, { data: batchData }] = await withRetry(() => withTimeout(Promise.all([
        fetch('/api/lab-notebook').then(r => r.json()),
        supabase.from('batches').select('id, batch_id, variant').limit(100)
      ]), 45000, 'Lab notebook load timed out'));
      if (entriesRes.success) {
        setEntries(entriesRes.data || []);
      } else {
        toast.error(entriesRes.error || 'Failed to load lab notebook entries.');
      }
      setBatches(batchData || []);
    } catch (err) { console.error('LNB fetch error:', err); }
    finally { setLoading(false); }
  }, [supabase]);

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => { if (!authLoading) { fetchData(); fetchPendingIds(); } }, [fetchData, authLoading]);

  const handleCreateSubmit = async (data) => {
    setSubmitting(true);
    try {
      let attachment_url = null;
      if (attachedFile) {
        setUploadProgress('Uploading attachment...');
        const fileExt = attachedFile.name.split('.').pop();
        const fileName = `lnb_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('lab-notebook-files')
          .upload(fileName, attachedFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error('File upload failed: ' + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from('lab-notebook-files').getPublicUrl(uploadData.path);
        attachment_url = publicUrl;
        setUploadProgress('');
      }
      const res = await fetch('/api/lab-notebook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          flask_id:             selectedFlaskId || null,
          batch_stage:          selectedStage   || null,
          attachment_url,
          // SOP linkage — real FK array into sop_library
          sop_ids: sopIds,
          // G-25: version linkage
          previous_version_id: versionSourceEntry?.id || null,
          entry_version: versionSourceEntry ? (versionSourceEntry.entry_version || 1) + 1 : 1,
          // G-77: hypothesis; G-76: direct observations
          objective: data.hypothesis || null,
          observations: data.direct_observations || null,
          // G-90: sketch URL
          sketch_url: sketchUrl || null,
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create entry');
      setShowNew(false);
      reset();
      setAttachedFile(null);
      setSelectedFlaskId('');
      setSelectedStage('');
      setBatchFlasks([]);
      setSopIds([]);
      setSketchUrl('');
      setVersionSourceEntry(null);
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); setUploadProgress(''); }
  };

  // G-24: Countersign an entry (supervisor/CEO only)
  const isApprover = ['ceo','admin','cto','research_fellow','scientist'].includes(employeeProfile?.role);

  const handleCountersign = (entryId) => {
    if (!isApprover || countersigning) return;
    setEsigConfig({ isOpen: true, entryId });
  };
  
  const handleEsigSuccess = async () => {
    const entryId = esigConfig.entryId;
    setEsigConfig({ isOpen: false, entryId: null });
    
    setCountersigning(entryId);
    const previousEntries = [...entries];
    
    // Optimistic UI Update
    setEntries(entries.map(e => 
      e.id === entryId 
        ? { ...e, status: 'Countersigned', countersigned_by: employeeProfile.id, countersigned_at: new Date().toISOString() } 
        : e
    ));

    try {
      const { error } = await supabase.from('lab_notebook_entries').update({
        countersigned_by: employeeProfile.id,
        countersigned_at: new Date().toISOString(),
        status: 'Countersigned',
      }).eq('id', entryId);
      if (error) throw error;
      toast.success('Entry countersigned successfully.');
      // fetchData is skipped to preserve the optimistic update
    } catch (err) { 
      toast.error(err.message); 
      setEntries(previousEntries); // Rollback on error
    }
    finally { setCountersigning(null); }
  };

  // G-25: Start a new version from an existing entry
  const handleNewVersion = (entry) => {
    setVersionSourceEntry(entry);
    setSopIds(entry.sop_ids || []);
    reset({ title: `${entry.title} (v${(entry.entry_version||1)+1})`, batch_id: entry.batch_id || '' });
    setShowNew(true);
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Draft':         <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">DRAFT</span>,
      'Submitted':     <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200">SUBMITTED</span>,
      'Countersigned': <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">COUNTERSIGNED</span>,
    };
    return badges[status] || null;
  };

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="flex justify-between items-center"><Skeleton width={200} height={32}/> <Skeleton width={150} height={40}/></div>
        <div className="space-y-4 pt-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl"/>)}</div>
      </div>
    );
  }

  return (
    <div className="page-container text-slate-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Digital LNB</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Official Electronic Lab Notebook & Experiment Records</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95 shadow-sm">
          <BookOpen className="w-4 h-4 mr-1.5" /> Start New Experiment
        </button>
      </div>

      {/* ── Search + Sort + Group controls ── */}
      <div className="mt-6 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by title, author, batch ID or prep code…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4"/>
            </button>
          )}
        </div>

        {/* Group tabs + Sort */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { key: 'all',          label: 'All' },
              { key: 'fermentation', label: 'Fermentation / Batch' },
              { key: 'cell_bank',    label: 'Cell Bank' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterGroup(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterGroup === tab.key ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { key: 'newest', label: 'Newest', Icon: SortDesc },
              { key: 'oldest', label: 'Oldest', Icon: SortAsc  },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setSortOrder(key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortOrder === key ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon className="w-3 h-3"/> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Entry list (grouped) ── */}
      {(() => {
        // 1. Filter by search
        const q = debouncedSearchTerm.toLowerCase();
        const filtered = entries.filter(e =>
          !q ||
          e.title?.toLowerCase().includes(q) ||
          e.author?.full_name?.toLowerCase().includes(q) ||
          e.batches?.batch_id?.toLowerCase().includes(q) ||
          e.cell_bank_preparations?.prep_code?.toLowerCase().includes(q)
        );

        // 2. Classify each entry
        const isCellBank = e => !!e.cell_bank_preparations || e.batch_stage === 'cell_bank';
        const isFermentation = e => !!e.batches;
        const isBatchCompleted = e => ['released', 'rejected'].includes(e.batches?.status);

        // 3. Apply group filter
        const grouped = filterGroup === 'cell_bank'
          ? { 'Cell Bank': filtered.filter(isCellBank) }
          : filterGroup === 'fermentation'
          ? {
              'Active Batches':    filtered.filter(e => isFermentation(e) && !isBatchCompleted(e)),
              'Completed Batches': filtered.filter(e => isFermentation(e) && isBatchCompleted(e)),
            }
          : {
              'Active Batches':    filtered.filter(e => isFermentation(e) && !isBatchCompleted(e)),
              'Completed Batches': filtered.filter(e => isFermentation(e) && isBatchCompleted(e)),
              'Cell Bank':         filtered.filter(isCellBank),
              'General':           filtered.filter(e => !isCellBank(e) && !isFermentation(e)),
            };

        // 4. Sort within each group
        const sort = (arr) => [...arr].sort((a, b) => {
          const da = new Date(a.created_at), db = new Date(b.created_at);
          return sortOrder === 'oldest' ? da - db : db - da;
        });

        const totalVisible = Object.values(grouped).flat().length;

        if (totalVisible === 0) return (
          <div className="card p-12 text-center mt-4">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4"/>
            <h3 className="text-lg font-bold text-slate-700">{entries.length === 0 ? 'No LNB Entries Found' : 'No results match your search'}</h3>
            <p className="text-sm text-slate-500 mt-1 mb-6">{entries.length === 0 ? 'Start documenting your experiments.' : 'Try a different search term or group.'}</p>
            {entries.length === 0 && <button onClick={() => setShowNew(true)} className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all">Start First Entry</button>}
          </div>
        );

        const EntryCard = ({ entry }) => (
          <Link key={entry.id} href={`/lab-notebook/${entry.id}`} className="block group">
            <div className="card p-5 hover:shadow-md transition-all border border-slate-100 hover:border-navy/20 cursor-pointer">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    {getStatusBadge(entry.status)}
                    <span className="text-xs font-bold text-slate-400">{new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {entry.attachment_url && (
                      <span className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <Paperclip className="w-3 h-3"/> Attachment
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-black text-slate-900 group-hover:text-navy transition-colors break-words">{entry.title}</h2>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div className="flex items-center text-sm text-slate-600">
                      <FileSignature className="w-4 h-4 mr-1.5 text-slate-400"/>
                      <span className="font-semibold text-xs">{entry.author?.full_name || 'Unknown Author'}</span>
                    </div>
                    {entry.batches && (
                      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/batches/${entry.batches.id}`); }}
                        className="flex items-center gap-1 text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 hover:bg-slate-100 transition-colors">
                        <FlaskConical className="w-3 h-3 text-slate-400"/>
                        <span className="font-bold">{entry.batches.batch_id}</span>
                      </button>
                    )}
                    {entry.cell_bank_preparations && (
                      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/research/cell-bank/${entry.cell_bank_preparations.id}`); }}
                        className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 hover:bg-emerald-100 transition-colors">
                        <Microscope className="w-3 h-3 text-emerald-500"/>
                        <span className="font-bold">{entry.cell_bank_preparations.prep_code}</span>
                      </button>
                    )}
                    {entry.flask?.flask_label && (
                      <div className="flex items-center gap-1 text-xs bg-navy/5 text-navy px-2 py-0.5 rounded border border-navy/15">
                        <FlaskConical className="w-3 h-3"/>
                        <span className="font-bold">{entry.flask.flask_label}</span>
                      </div>
                    )}
                    {entry.batch_stage && (
                      <div className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100">
                        <Activity className="w-3 h-3"/>
                        <span className="font-bold">{STAGE_LABELS[entry.batch_stage] || entry.batch_stage}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {entry.author && (
                    <CreatorBadge initials={entry.author.initials} fullName={entry.author.full_name} size="sm"/>
                  )}
                  {/* G-25: Version badge */}
                  {(entry.entry_version > 1 || entry.previous_version_id) && (
                    <span className="px-1.5 py-0.5 bg-slate-50 text-slate-600 text-xs font-black rounded border border-slate-100 uppercase">
                      v{entry.entry_version || 1}
                    </span>
                  )}
                  {/* G-24: Countersign button for submitted entries */}
                  {entry.status === 'Submitted' && isApprover && entry.created_by !== employeeProfile?.id && (
                    <div onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                      <button
                        onClick={() => handleCountersign(entry.id)}
                        disabled={countersigning === entry.id}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg uppercase tracking-wider disabled:opacity-50">
                        {countersigning === entry.id ? '...' : '✓ Countersign'}
                      </button>
                    </div>
                  )}
                  {/* G-25: New version button */}
                  {entry.status !== 'Draft' && entry.created_by === employeeProfile?.id && (
                    <div onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
                      <button onClick={() => handleNewVersion(entry)}
                        className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-200 font-bold text-xs rounded-lg uppercase">
                        <History className="w-3 h-3"/>New Ver
                      </button>
                    </div>
                  )}
                  {entry.status === 'Draft' && entry.created_by === employeeProfile?.id && (
                    <div onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/lab-notebook/${entry.id}`); }}>
                      <button className="flex items-center gap-1 px-2.5 py-1.5 bg-white/70 hover:bg-navy/10 border border-slate-200 hover:border-navy/30 text-slate-500 hover:text-navy rounded-lg text-xs font-bold transition-all">
                        Edit
                      </button>
                    </div>
                  )}
                  <div className="p-3 rounded-full bg-slate-50 group-hover:bg-slate-50 transition-colors">
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-navy"/>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        );

        return (
          <div className="mt-4 space-y-6">
            {Object.entries(grouped).map(([groupName, groupEntries]) => {
              const sorted = sort(groupEntries);
              if (sorted.length === 0) return null;
              const groupIcon = groupName === 'Cell Bank' ? <Microscope className="w-3.5 h-3.5"/> : groupName === 'Active Batches' ? <FlaskConical className="w-3.5 h-3.5"/> : groupName === 'Completed Batches' ? <CheckCircle className="w-3.5 h-3.5"/> : <BookOpen className="w-3.5 h-3.5"/>;
              const groupColor = groupName === 'Cell Bank' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : groupName === 'Active Batches' ? 'text-slate-700 bg-slate-50 border-slate-200' : groupName === 'Completed Batches' ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-slate-600 bg-slate-50 border-slate-200';
              return (
                <div key={groupName}>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border mb-3 ${groupColor}`}>
                    {groupIcon} {groupName} <span className="opacity-60">({sorted.length})</span>
                  </div>
                  <div className="grid gap-3">
                    {sorted.map(entry => <EntryCard key={entry.id} entry={entry}/>)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {showNew && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-0 sm:p-4">
          <div className="h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-none sm:rounded-2xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200">
            <div className="p-6 pb-0 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">Create Notebook Entry</h2>
                <p className="text-xs font-medium text-slate-500 mt-1">Initialize a new experiment document draft</p>
              </div>
              <button onClick={() => { setShowNew(false); reset(); setAttachedFile(null); setSelectedFlaskId(''); setSelectedStage(''); setBatchFlasks([]); }} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(handleCreateSubmit)} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Experiment Title / Objective</label>
                <input type="text" placeholder="e.g. Yield Optimization Trial 4" {...register('title')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                {suggestedTags.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-amber-500"/>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Suggested Tags:</span>
                    {suggestedTags.map(tag => <span key={tag} className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-xs font-black">{tag}</span>)}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Batch <span className="text-slate-400 font-normal">(Optional)</span></label>
                <select {...register('batch_id')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all">
                  <option value="">No Batch Linked</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.batch_id} ({b.variant})</option>)}
                </select>
              </div>

              {/* Flask + Stage — only shown when a batch is selected */}
              {watchedBatchId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Trial / Flask <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <select value={selectedFlaskId} onChange={e => setSelectedFlaskId(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy transition-all">
                      <option value="">Whole Batch</option>
                      {batchFlasks.map(f => <option key={f.id} value={f.id}>{f.flask_label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Stage <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <select value={selectedStage} onChange={e => setSelectedStage(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy transition-all">
                      <option value="">Any Stage</option>
                      {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* G-77: Hypothesis / Objective freeform section */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Hypothesis / Objective <span className="text-slate-400 font-normal">(Optional)</span></label>
                <textarea {...register('hypothesis')} rows={2} placeholder="e.g. Increasing inoculum % from 5% to 10% v/v will reduce fermentation time by 20%..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy resize-none transition-all"/>
              </div>
              {/* G-76: Freeform observations field (direct entry, not just panel-synced) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Direct Observations / Notes <span className="text-slate-400 font-normal">(Freeform)</span></label>
                <textarea {...register('direct_observations')} rows={3} placeholder="Record any real-time observations, deviations, unexpected results, or procedure modifications directly..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy resize-none transition-all"/>
              </div>

              {/* Linked SOPs — real link into sop_library, not retyped */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Linked SOPs <span className="text-slate-400 font-normal">(Optional)</span></label>
                <div className="max-h-32 overflow-y-auto bg-slate-50 border border-slate-100 rounded-lg p-2 space-y-1">
                  {sops.map(s => (
                    <label key={s.id} className="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer transition-colors text-xs font-semibold text-slate-700">
                      <input type="checkbox" checked={sopIds.includes(s.id)}
                        onChange={(ev) => setSopIds(ev.target.checked ? [...sopIds, s.id] : sopIds.filter(id => id !== s.id))}
                        className="rounded text-navy focus:ring-navy flex-shrink-0" />
                      {s.sop_id ? `${s.sop_id} — ` : ''}{s.title}
                    </label>
                  ))}
                  {sops.length === 0 && <p className="text-xs text-slate-400 p-2 italic text-center">No active SOPs.</p>}
                </div>
                <p className="text-xs text-slate-400 mt-1">The procedure is referenced here, not retyped — see it read-only after saving. Submitting is blocked until the linked SOP(s) are e-signed.</p>
              </div>

              {/* G-90: Sketch / Diagram attachment URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sketch / Diagram URL <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input type="url" value={sketchUrl} onChange={e=>setSketchUrl(e.target.value)} placeholder="https://... (link to sketch, diagram, or annotated image)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy transition-all"/>
                <p className="text-xs text-slate-400 mt-1">Upload sketch to cloud storage (Drive, Supabase) and paste the link here</p>
              </div>

              {/* G-25: version source indicator */}
              {versionSourceEntry && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <History className="w-4 h-4 shrink-0"/>
                  Creating Version {(versionSourceEntry.entry_version||1)+1} from: <span className="font-black">&quot;{versionSourceEntry.title}&quot;</span>
                  <button type="button" onClick={()=>setVersionSourceEntry(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5"/></button>
                </div>
              )}

              {/* File Attachment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Attach Supporting File <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
                  onChange={e => setAttachedFile(e.target.files?.[0] || null)} />
                {attachedFile ? (
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <Paperclip className="w-4 h-4 text-slate-500 shrink-0"/>
                    <span className="text-xs font-bold text-slate-700 flex-1 truncate">{attachedFile.name}</span>
                    <button type="button" onClick={() => { setAttachedFile(null); if(fileRef.current) fileRef.current.value=''; }} className="text-red-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 p-2.5 border border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-navy hover:text-navy transition-all">
                    <Upload className="w-4 h-4"/> Click to attach PDF, image, or data file
                  </button>
                )}
                <p className="text-xs text-slate-400 mt-1">Accepted: PDF, PNG, JPG, XLSX, CSV, DOCX</p>
              </div>

              {uploadProgress && (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin"/> {uploadProgress}
                </div>
              )}

              <div className="pt-2">
                <button disabled={submitting} type="submit" className="w-full py-2.5 bg-navy text-white font-bold uppercase tracking-wider text-xs rounded-lg shadow-sm hover:bg-navy-hover transition-all flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Initialize Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <ESignatureModal
        isOpen={esigConfig.isOpen}
        onClose={() => setEsigConfig({ isOpen: false, entryId: null })}
        onSuccess={handleEsigSuccess}
        title="Countersign Document"
        message="By countersigning, you legally verify this document's contents and attest to its accuracy under 21 CFR Part 11."
      />
    </div>
  );
}
