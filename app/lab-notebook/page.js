'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { BookOpen, Loader2, FileSignature, ChevronRight, FlaskConical, Sparkles, X, Paperclip, Upload } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';

export default function DigitalLnbPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileRef = useRef(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({ 
      title: z.string().min(3, 'Experiment title is required'), 
      batch_id: z.string().optional() 
    })),
    defaultValues: { title: '', batch_id: '' }
  });
  
  const currentTitle = watch('title');
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (currentTitle && currentTitle.length > 5) {
      const tags = [];
      const t = currentTitle.toLowerCase();
      if (t.includes('yield')) tags.push('#Performance');
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
      const [entriesRes, { data: batchData }] = await Promise.all([
        fetch('/api/lab-notebook').then(res => res.json()),
        supabase.from('batches').select('id, batch_id, variant').limit(100)
      ]);
      if (entriesRes.success) setEntries(entriesRes.data || []);
      setBatches(batchData || []);
    } catch (err) { console.error('LNB fetch error:', err); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        body: JSON.stringify({ ...data, attachment_url })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create entry');
      setShowNew(false); reset(); setAttachedFile(null); fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); setUploadProgress(''); }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Draft':         <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">DRAFT</span>,
      'Submitted':     <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">SUBMITTED</span>,
      'Countersigned': <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">COUNTERSIGNED</span>,
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
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Digital LNB</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Official Electronic Lab Notebook & Experiment Records</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95 shadow-sm">
          <BookOpen className="w-4 h-4 mr-1.5" /> Start New Experiment
        </button>
      </div>

      <div className="grid gap-4 mt-8">
        {entries.length === 0 ? (
          <div className="surface p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-700">No LNB Entries Found</h3>
            <p className="text-sm text-gray-500 mt-1 mb-6">Start documenting your experiments and protocols.</p>
            <button onClick={() => setShowNew(true)} className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-gray-200 transition-all">Start First Entry</button>
          </div>
        ) : (
          entries.map((entry) => (
            <Link key={entry.id} href={`/lab-notebook/${entry.id}`} className="block group">
              <div className="surface p-5 hover:shadow-md transition-all border border-gray-100 hover:border-navy/20 cursor-pointer">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {getStatusBadge(entry.status)}
                      <span className="text-xs font-bold text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                      {entry.attachment_url && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          <Paperclip className="w-3 h-3"/> Attachment
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-black text-gray-900 group-hover:text-navy transition-colors">{entry.title}</h2>
                    <div className="flex items-center gap-4 mt-3 flex-wrap">
                      <div className="flex items-center text-sm text-gray-600">
                        <FileSignature className="w-4 h-4 mr-1.5 text-gray-400" />
                        <span className="font-semibold">{entry.author?.full_name || 'Unknown Author'}</span>
                      </div>
                      {entry.batches && (
                        <div className="flex items-center text-sm text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                          <span className="font-bold text-indigo-900">{entry.batches.batch_id}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center p-3 rounded-full bg-gray-50 group-hover:bg-blue-50 transition-colors">
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-navy" />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden">
            <div className="p-6 pb-0 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Create Notebook Entry</h2>
                <p className="text-xs font-medium text-gray-500 mt-1">Initialize a new experiment document draft</p>
              </div>
              <button onClick={() => { setShowNew(false); reset(); setAttachedFile(null); }} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(handleCreateSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Experiment Title / Objective</label>
                <input type="text" placeholder="e.g. Yield Optimization Trial 4" {...register('title')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                {suggestedTags.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-amber-500"/>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Suggested Tags:</span>
                    {suggestedTags.map(tag => <span key={tag} className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[9px] font-black">{tag}</span>)}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Target Batch (Optional)</label>
                <select {...register('batch_id')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all">
                  <option value="">No Batch Linked</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.batch_id} ({b.variant})</option>)}
                </select>
              </div>

              {/* File Attachment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Attach Supporting File <span className="text-gray-400 font-normal">(Optional)</span></label>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
                  onChange={e => setAttachedFile(e.target.files?.[0] || null)} />
                {attachedFile ? (
                  <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <Paperclip className="w-4 h-4 text-blue-500 shrink-0"/>
                    <span className="text-xs font-bold text-blue-700 flex-1 truncate">{attachedFile.name}</span>
                    <button type="button" onClick={() => { setAttachedFile(null); if(fileRef.current) fileRef.current.value=''; }} className="text-red-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 p-2.5 border border-dashed border-gray-200 rounded-lg text-xs font-bold text-gray-400 hover:border-navy hover:text-navy transition-all">
                    <Upload className="w-4 h-4"/> Click to attach PDF, image, or data file
                  </button>
                )}
                <p className="text-[10px] text-gray-400 mt-1">Accepted: PDF, PNG, JPG, XLSX, CSV, DOCX</p>
              </div>

              {uploadProgress && (
                <div className="flex items-center gap-2 text-xs font-medium text-blue-600">
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
    </div>
  );
}
