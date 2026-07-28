// @ts-nocheck
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { BookOpen, CheckCircle, AlertTriangle, ExternalLink, Mail, X, Search, Trash2, Users } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import SecureViewerModal from '@/components/ui/SecureViewerModal';
import { motion, AnimatePresence } from 'framer-motion';
const FALLBACK_QUIZ = [
  { q: "What is the primary objective of this SOP?", options: ["General reading", "Strict compliance", "Optional reference"], correct: 1 },
  { q: "Who is responsible for executing this procedure?", options: ["Any staff", "Trained personnel only", "External contractors"], correct: 1 }
];

const uploadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  version: z.string().min(1, "Version is required"),
  file: z.any().refine((files) => files && files.length > 0, "Document file is required"),
  target_roles: z.array(z.string()).optional(),
  target_departments: z.array(z.string()).optional(),
  target_employees: z.array(z.string()).optional()
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
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const [showUploadModal, setShowUploadModal] = useState(false);
  
  const { register: regUpload, handleSubmit: handUpload, formState: { errors: upErrors, isSubmitting: isUploading }, reset: resetUpload } = useForm({
    resolver: zodResolver(uploadSchema),
    defaultValues: { title: '', category: 'QC', version: '1.0' }
  });

  const fetchSOPs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withTimeout(supabase.from('sop_library').select('*, sop_acknowledgements(employee_id)').eq('is_active', true), 20000, 'SOPs load timed out');
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
        
      supabase.from('employees').select('id, full_name, role').eq('is_active', true)
        .then(({ data }) => {
          if (data) setEmployeesList(data);
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
  const [showSignaturesModal, setShowSignaturesModal] = useState<any>(null);
  const [viewerDoc, setViewerDoc] = useState<{url: string, title: string} | null>(null);
  const [signaturesData, setSignaturesData] = useState<any[]>([]);
  const [loadingSignatures, setLoadingSignatures] = useState(false);
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
      } else {
        toast.error("Failed to sign SOP. Please try again.");
      }
    } catch (err) {
      toast.error("Error acknowledging SOP: " + err.message);
    } finally { 
      setSubmittingAck(false); 
    }
  };

  const handleDeleteSOP = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SOP? This action cannot be undone and will delete all associated signatures.')) return;
    try {
      const res = await fetch(`/api/sops/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete SOP');
      }
      toast.success('SOP deleted successfully');
      fetchSOPs();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleViewSignatures = async (sopId: string) => {
    setShowSignaturesModal(sopId);
    setLoadingSignatures(true);
    setSignaturesData([]);
    try {
      const res = await fetch(`/api/sops/${sopId}/acknowledgements`);
      const data = await res.json();
      if (res.ok) {
        setSignaturesData(data.data || []);
      } else {
        toast.error('Failed to load signatures');
      }
    } catch (err) {
      toast.error('Error loading signatures');
    } finally {
      setLoadingSignatures(false);
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
          document_url: uploadData.url,
          target_roles: data.target_roles || [],
          target_departments: data.target_departments || [],
          target_employees: data.target_employees || []
        })
      });

      const dbResData = await dbRes.json();
      if (!dbRes.ok) throw new Error(dbResData.error || "Database insert failed");

      toast.success("SOP uploaded successfully.");
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
          <p className="text-sm text-slate-500 mt-1">Official lab protocols and signatures.</p>
        </div>
        {['admin','ceo','cto','research_fellow'].includes(role) && <button onClick={() => setShowUploadModal(true)} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider">Upload Doc</button>}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search SOP ID, title, category..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-600 outline-none">
            <option value="All">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-600 outline-none">
            <option value="All">All Signatures</option>
            <option value="pending">Needs Review</option>
            <option value="acknowledged">Signed</option>
          </select>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-600 outline-none">
            <option value="title">Title A-Z</option>
            <option value="effective">Effective Date</option>
            <option value="category">Category</option>
            <option value="status">Signature Status</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSops.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-16 text-center text-sm font-bold text-slate-400">No SOPs match the current search.</div>
        ) : filteredSops.map((sop: any) => (
          <div key={sop.id} className={`card p-5 flex flex-col hover:border-slate-300 transition-colors ${!sop.is_acknowledged ? 'border-slate-300 bg-slate-100/10' : ''}`}>
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono text-xs font-bold tracking-wider text-navy bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">{sop.sop_id}</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{sop.category}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-2 leading-tight flex-1">{sop.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-xs border-t border-slate-100 pt-3">
              <div><span className="block font-bold text-slate-400 uppercase">Version</span><span className="font-semibold text-slate-700">{sop.version}</span></div>
              <div><span className="block font-bold text-slate-400 uppercase">Effective</span><span className="font-semibold text-slate-700">{sop.effective_date ? new Date(sop.effective_date).toLocaleDateString() : 'Draft'}</span></div>
            </div>
            <div className="flex justify-between items-center mt-auto pt-3 border-t border-slate-100">
              {sop.is_acknowledged ? (
                <div className="flex items-center text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-xs font-bold uppercase border border-emerald-100"><CheckCircle className="w-3.5 h-3.5 mr-1" /> Read & Signed</div>
              ) : (
                <div className="flex items-center text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs font-bold uppercase border border-amber-100"><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Needs Review</div>
              )}
              <div className="flex gap-2">
                {['admin','ceo','cto'].includes(role) && (
                  <button onClick={() => handleViewSignatures(sop.id)} className="p-1 text-slate-800 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-transparent hover:border-slate-300 transition-colors" title="View Acknowledgements">
                    <Users className="w-4 h-4" />
                  </button>
                )}
                {sop.document_url ? (
                  <button onClick={() => setViewerDoc({url: sop.document_url, title: sop.title})} className="p-1 text-slate-400 hover:text-navy hover:bg-slate-50 rounded-md border border-transparent hover:border-slate-200 transition-colors" title="Secure Document View">
                    <BookOpen className="w-4 h-4" />
                  </button>
                ) : (
                  <button disabled title="No document attached" className="p-1 text-slate-200 cursor-not-allowed border border-transparent">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
                {['admin','ceo','cto'].includes(role) && (
                  <button onClick={() => handleDeleteSOP(sop.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md border border-transparent hover:border-red-200 transition-colors" title="Delete SOP">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {!sop.is_acknowledged && (
              <button onClick={() => { setShowAckModal(sop); setSignatureText(`I confirm that I have read and understood ${sop.sop_id} (${sop.title}) and will follow it strictly.`); }} className="w-full mt-3 bg-navy hover:bg-navy-hover text-white font-bold text-xs py-2 rounded-lg transition-colors uppercase tracking-wider">Sign SOP</button>
            )}
          </div>
        ))}
      </div>

      {showAckModal && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 pb-32 relative shadow-xl border border-slate-100 flex flex-col gap-4 overflow-y-auto max-h-[95vh]">
            <button onClick={() => { setShowAckModal(null); setQuizStarted(false); setQuizScore(0); }} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            <div className="flex flex-col gap-0.5"><h2 className="text-base font-bold text-slate-900">Digital Acknowledgment</h2><p className="text-accent font-bold uppercase tracking-wider text-xs">Module 8: Interactive Compliance</p></div>
            
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Procedure</p>
              <p className="text-sm font-bold text-slate-800 leading-snug">{showAckModal.title}</p>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="bg-emerald-500 rounded-full p-1"><CheckCircle className="w-5 h-5 text-white"/></div>
                  <div><p className="text-xs font-black text-emerald-900 uppercase">Ready for Signature</p><p className="text-xs text-emerald-700">Please provide your digital signature below.</p></div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Mail className="w-3 h-3"/> Signature Statement</label>
                  <textarea value={signatureText} onChange={(e) => setSignatureText(e.target.value)} rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-accent resize-none" />
                </div>
                <button disabled={submittingAck} onClick={acknowledgeSOP} className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider flex items-center justify-center gap-1">{submittingAck ? "Processing..." : "Sign Procedure"}</button>
              </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 pb-32 relative shadow-xl overflow-y-auto max-h-[95vh]">
            <button onClick={() => setShowUploadModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
            <h2 className="text-base font-bold text-slate-900 mb-4">Upload Document</h2>
            <form onSubmit={handUpload(onUploadSubmit)} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Title</label>
                <input type="text" {...regUpload('title')} className="w-full border border-slate-200 rounded-lg p-2 outline-none font-semibold text-sm" />
                {upErrors.title && <p className="text-red-500 text-xs mt-1">{String(upErrors.title.message)}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Category</label>
                  <select {...regUpload('category')} className="w-full border border-slate-200 rounded-lg p-2 outline-none bg-white text-sm font-semibold">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Version</label>
                  <input type="text" {...regUpload('version')} className="w-full border border-slate-200 rounded-lg p-2 outline-none text-sm font-semibold" />
                  {upErrors.version && <p className="text-red-500 text-xs mt-1">{String(upErrors.version.message)}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 mt-2 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Roles (leave empty for all)</label>
                  <div className="flex flex-wrap gap-2">
                    {['admin', 'ceo', 'cto', 'research_fellow', 'scientist', 'staff', 'intern'].map(role => (
                      <label key={role} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input type="checkbox" value={role} {...regUpload('target_roles')} className="rounded border-slate-300 text-navy focus:ring-navy w-3.5 h-3.5" />
                        <span className="text-xs font-bold text-slate-700 uppercase">{role.replace('_', ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Departments</label>
                  <div className="flex flex-wrap gap-2">
                    {['Admin', 'R&D', 'Production', 'Management'].map(dept => (
                      <label key={dept} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input type="checkbox" value={dept} {...regUpload('target_departments')} className="rounded border-slate-300 text-navy focus:ring-navy w-3.5 h-3.5" />
                        <span className="text-xs font-bold text-slate-700 uppercase">{dept}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Specific Employees</label>
                  <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50/50 scrollbar-thin">
                    {employeesList.map(e => (
                      <label key={e.id} className="flex items-center gap-2 hover:bg-white p-1.5 rounded cursor-pointer transition-colors">
                        <input type="checkbox" value={e.id} {...regUpload('target_employees')} className="rounded border-slate-300 text-navy focus:ring-navy w-3.5 h-3.5" />
                        <span className="text-xs font-semibold text-slate-700">{e.full_name} <span className="text-xs text-slate-400 font-bold uppercase ml-1">({e.role?.replace('_', ' ')})</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">File (Document/PDF)</label>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" {...regUpload('file')} className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-xs" />
                {upErrors.file && <p className="text-red-500 text-xs mt-1">{String(upErrors.file.message)}</p>}
              </div>
              <button disabled={isUploading} type="submit" className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider mt-2">{isUploading ? 'Uploading...' : 'Publish'}</button>
            </form>
          </div>
        </div>
      )}
      {showSignaturesModal && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 relative shadow-xl overflow-y-auto max-h-[85vh]">
            <button onClick={() => setShowSignaturesModal(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            <h2 className="text-xl font-black text-slate-900 mb-2">SOP Acknowledgements</h2>
            <p className="text-xs text-slate-500 mb-6">List of all staff who have digitally signed this protocol.</p>
            
            {loadingSignatures ? (
              <div className="py-8 text-center text-sm font-bold text-slate-400">Loading signatures...</div>
            ) : signaturesData.length === 0 ? (
              <div className="py-8 text-center text-sm font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-100">No signatures found for this SOP.</div>
            ) : (
              <div className="space-y-3">
                {signaturesData.map((sig, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-emerald-50/30 border border-emerald-100 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs uppercase">
                        {sig.employees?.initials || sig.employees?.full_name?.substring(0, 2) || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{sig.employees?.full_name || 'Unknown User'}</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{sig.employees?.role || 'Staff'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-600">Signed on</p>
                      <p className="text-xs font-bold text-emerald-700">{new Date(sig.acknowledged_at).toLocaleDateString()} {new Date(sig.acknowledged_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {viewerDoc && (
        <SecureViewerModal 
          url={viewerDoc.url} 
          title={viewerDoc.title} 
          onClose={() => setViewerDoc(null)} 
        />
      )}
    </div>
  );
}
