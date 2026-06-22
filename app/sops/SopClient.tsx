'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { notifyEmployee } from '@/lib/notifyEmployee';
import { BookOpen, CheckCircle, AlertTriangle, ExternalLink, Mail, X, Search } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
const FALLBACK_QUIZ = [
  { q: "What is the primary objective of this SOP?", options: ["General reading", "Strict compliance", "Optional reference"], correct: 1 },
  { q: "Who is responsible for executing this procedure?", options: ["Any staff", "Trained personnel only", "External contractors"], correct: 1 }
];

const uploadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  version: z.string().min(1, "Version is required"),
  file: z.any().refine((files) => files && files.length > 0, "Document file is required")
});


export default function SopClient({ initialSops }: { initialSops: any[] }) {
  const { role, employeeProfile, loading: authLoading } = useAuth() as any;
  const toast = useToast();
  const [sops, setSops] = useState(initialSops || []);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>(['Fermentation', 'QC', 'Sanitation', 'Safety']);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('title');
  const supabase = useMemo(() => createClient(), []);

  const [showUploadModal, setShowUploadModal] = useState(false);
  
  const { register: regUpload, handleSubmit: handUpload, formState: { errors: upErrors, isSubmitting: isUploading }, reset: resetUpload } = useForm({
    resolver: zodResolver(uploadSchema),
    defaultValues: { title: '', category: 'QC', version: '1.0' }
  });

  const fetchSOPs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('sop_library').select('*, sop_acknowledgements(employee_id)').eq('is_active', true);
      if (error) throw error;
      const mapped = (data || []).map((sop: any) => ({ ...sop, is_acknowledged: (sop.sop_acknowledgements || []).some((ack: any) => ack.employee_id === employeeProfile?.id) }));
      setSops(mapped);
    } catch (err) { console.error('Fetch SOPs error:', err); }
    finally { setLoading(false); }
  }, [supabase, employeeProfile]);


  useEffect(() => { 
    if (employeeProfile) {
      // Fetch categories from app_settings table
      supabase.from('app_settings').select('value').eq('key', 'document_categories').single()
        .then(({ data }) => { 
          if (data?.value) {
            try {
              const parsed = JSON.parse(data.value);
              setCategories(parsed.map((c: any) => c.label));
            } catch (e) { console.error('Failed to parse categories', e); }
          }
        });
      if (!initialSops || initialSops.length === 0) {
        fetchSOPs(); 
      }
    }

    if (!supabase) return;
    const channel = supabase.channel('sops_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sop_library' }, () => fetchSOPs())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [employeeProfile, fetchSOPs, initialSops, supabase]);

  const [showAckModal, setShowAckModal] = useState<any>(null);
  const [signatureText, setSignatureText] = useState("");
  const [submittingAck, setSubmittingAck] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);

  const handleQuizSubmit = () => {
    // Use quiz_data from DB, fall back to generic fallback
    const questions = (showAckModal.quiz_data && showAckModal.quiz_data.length > 0)
      ? showAckModal.quiz_data
      : FALLBACK_QUIZ;

    let score = 0;
    userAnswers.forEach((ans, idx) => { if (ans === questions[idx]?.correct) score += 1; });
    const finalPercent = (score / questions.length) * 100;
    setQuizScore(finalPercent);
    if (finalPercent < 100) {
      toast.warn(`Validation Failure: ${finalPercent}%. A 100% score is required to proceed with digital acknowledgment.`);
    }
  };

  const acknowledgeSOP = async () => {
    if (submittingAck || !signatureText.trim()) return;
    setSubmittingAck(true);
    try {
      const res = await fetch(`/api/sops/${showAckModal.id}/acknowledge`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          employee_id: employeeProfile.id, 
          signature_text: signatureText
        }) 
      });
      if (res.ok) { 
        setShowAckModal(null); 
        setSignatureText(""); 
        setQuizStarted(false);
        setQuizScore(0);
        setUserAnswers([]);
        fetchSOPs(); 
        notifyEmployee(employeeProfile.id, '📋 SOP Signed', `Acknowledged: "${showAckModal.title}".`, '/sops'); 
      } else {
        toast.error("Failed to sign SOP. Please try again.");
      }
    } catch (err) {
      toast.error("Error acknowledging SOP: " + err.message);
    } finally { 
      setSubmittingAck(false); 
    }
  };

  const onUploadSubmit = async (data) => {
    try {
      const file = data.file[0];
      const formData = new FormData(); 
      formData.append('file', file);
      
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData }); 
      const uploadData = await uploadRes.json();
      
      if (!uploadRes.ok) throw new Error(uploadData.error || "File upload failed");

      const dbRes = await fetch('/api/sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          category: data.category,
          version: data.version,
          document_url: uploadData.url
        })
      });

      const dbResData = await dbRes.json();
      if (!dbRes.ok) throw new Error(dbResData.error || "Database insert failed");

      setShowUploadModal(false); 
      resetUpload(); 
      fetchSOPs(); 
    } catch (err) {
      toast.error("Error: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="flex justify-between items-center"><Skeleton width={200} height={30}/> <Skeleton width={100} height={40}/></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl"/>)}
        </div>
      </div>
    );
  }

  const filteredSops = [...sops]
    .filter((sop: any) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesCategory = categoryFilter === 'All' || sop.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || (statusFilter === 'acknowledged' ? sop.is_acknowledged : !sop.is_acknowledged);
      const matchesSearch = !q || [
        sop.sop_id,
        sop.title,
        sop.category,
        sop.version
      ].some(value => String(value || '').toLowerCase().includes(q));
      return matchesCategory && matchesStatus && matchesSearch;
    })
    .sort((a: any, b: any) => {
      if (sortOrder === 'effective') return new Date(b.effective_date || 0).getTime() - new Date(a.effective_date || 0).getTime();
      if (sortOrder === 'category') return String(a.category || '').localeCompare(String(b.category || ''));
      if (sortOrder === 'status') return Number(a.is_acknowledged) - Number(b.is_acknowledged);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

  return (
    <div className="page-container">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">SOP Library</h1>
          <p className="text-sm text-gray-500 mt-1">Official lab protocols and signatures.</p>
        </div>
        {['admin','ceo','cto','research_fellow'].includes(role) && <button onClick={() => setShowUploadModal(true)} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider">Upload Doc</button>}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search SOP ID, title, category..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 outline-none">
            <option value="All">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 outline-none">
            <option value="All">All Signatures</option>
            <option value="pending">Needs Review</option>
            <option value="acknowledged">Signed</option>
          </select>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 outline-none">
            <option value="title">Title A-Z</option>
            <option value="effective">Effective Date</option>
            <option value="category">Category</option>
            <option value="status">Signature Status</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSops.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-16 text-center text-sm font-bold text-gray-400">No SOPs match the current search.</div>
        ) : filteredSops.map((sop: any) => (
          <div key={sop.id} className={`surface p-5 flex flex-col hover:border-gray-300 transition-colors ${!sop.is_acknowledged ? 'border-blue-200 bg-blue-50/10' : ''}`}>
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono text-xs font-bold tracking-wider text-navy bg-gray-100 px-1.5 py-0.5 rounded-md border border-gray-200">{sop.sop_id}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{sop.category}</span>
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-2 leading-tight flex-1">{sop.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-[11px] border-t border-gray-100 pt-3">
              <div><span className="block font-bold text-gray-400 uppercase">Version</span><span className="font-semibold text-gray-700">{sop.version}</span></div>
              <div><span className="block font-bold text-gray-400 uppercase">Effective</span><span className="font-semibold text-gray-700">{sop.effective_date ? new Date(sop.effective_date).toLocaleDateString() : 'Draft'}</span></div>
            </div>
            <div className="flex justify-between items-center mt-auto pt-3 border-t border-gray-100">
              {sop.is_acknowledged ? (
                <div className="flex items-center text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-[10px] font-bold uppercase border border-emerald-100"><CheckCircle className="w-3.5 h-3.5 mr-1" /> Read & Signed</div>
              ) : (
                <div className="flex items-center text-amber-700 bg-amber-50 px-2 py-1 rounded text-[10px] font-bold uppercase border border-amber-100"><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Needs Review</div>
              )}
              {sop.document_url ? (
                <a href={sop.document_url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-navy hover:bg-gray-50 rounded-md border border-transparent hover:border-gray-200">
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <button disabled title="No document attached" className="p-1 text-gray-200 cursor-not-allowed border border-transparent">
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>
            {!sop.is_acknowledged && (
              <button onClick={() => { setShowAckModal(sop); setSignatureText(`I confirm that I have read and understood ${sop.sop_id} (${sop.title}) and will follow it strictly.`); }} className="w-full mt-3 bg-navy hover:bg-navy-hover text-white font-bold text-xs py-2 rounded-lg transition-colors uppercase tracking-wider">Sign SOP</button>
            )}
          </div>
        ))}
      </div>

      {showAckModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 pb-32 relative shadow-xl border border-gray-100 flex flex-col gap-4 overflow-y-auto max-h-[95vh]">
            <button onClick={() => { setShowAckModal(null); setQuizStarted(false); setQuizScore(0); }} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            <div className="flex flex-col gap-0.5"><h2 className="text-base font-bold text-gray-900">Digital Acknowledgment</h2><p className="text-accent font-bold uppercase tracking-wider text-[9px]">Module 8: Interactive Compliance</p></div>
            
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
              <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Procedure</p>
              <p className="text-sm font-bold text-gray-800 leading-snug">{showAckModal.title}</p>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="bg-emerald-500 rounded-full p-1"><CheckCircle className="w-5 h-5 text-white"/></div>
                  <div><p className="text-xs font-black text-emerald-900 uppercase">Ready for Signature</p><p className="text-[10px] text-emerald-700">Please provide your digital signature below.</p></div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Mail className="w-3 h-3"/> Signature Statement</label>
                  <textarea value={signatureText} onChange={(e) => setSignatureText(e.target.value)} rows={3} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-accent resize-none" />
                </div>
                <button disabled={submittingAck} onClick={acknowledgeSOP} className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider flex items-center justify-center gap-1">{submittingAck ? "Processing..." : "Sign Procedure"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 pb-32 relative shadow-xl overflow-y-auto max-h-[95vh]">
            <button onClick={() => setShowUploadModal(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
            <h2 className="text-base font-bold text-gray-900 mb-4">Upload Document</h2>
            <form onSubmit={handUpload(onUploadSubmit)} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1">Title</label>
                <input type="text" {...regUpload('title')} className="w-full border border-gray-200 rounded-lg p-2 outline-none font-semibold text-sm" />
                {upErrors.title && <p className="text-red-500 text-xs mt-1">{String(upErrors.title.message)}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Category</label>
                  <select {...regUpload('category')} className="w-full border border-gray-200 rounded-lg p-2 outline-none bg-white text-sm font-semibold">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Version</label>
                  <input type="text" {...regUpload('version')} className="w-full border border-gray-200 rounded-lg p-2 outline-none text-sm font-semibold" />
                  {upErrors.version && <p className="text-red-500 text-xs mt-1">{String(upErrors.version.message)}</p>}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1">File (Document/PDF)</label>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" {...regUpload('file')} className="w-full border border-gray-200 rounded-lg p-2 bg-gray-50 text-xs" />
                {upErrors.file && <p className="text-red-500 text-xs mt-1">{String(upErrors.file.message)}</p>}
              </div>
              <button disabled={isUploading} type="submit" className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider">{isUploading ? 'Uploading...' : 'Publish'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
