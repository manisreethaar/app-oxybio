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
import { BookOpen, CheckCircle, AlertTriangle, ExternalLink, Mail, X, Search, Trash2, Users, Download, UploadCloud, FileText, Calendar, ShieldCheck, Check, Lock } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import SecureViewerModal from '@/components/ui/SecureViewerModal';
import ESignatureModal from '@/components/ui/ESignatureModal';
import { motion, AnimatePresence } from 'framer-motion';

const uploadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  version: z.string().min(1, "Version is required"),
  effective_date: z.string().optional(),
  file: z.any().refine((files) => files && files.length > 0, "Document file is required"),
  target_roles: z.array(z.string()).optional(),
  target_departments: z.array(z.string()).optional(),
  target_employees: z.array(z.string()).optional()
});

const CATEGORY_COLORS = {
  'Fermentation': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'QC': 'bg-rose-50 text-rose-700 border-rose-200',
  'Sanitation': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Safety': 'bg-amber-50 text-amber-700 border-amber-200',
  'default': 'bg-slate-50 text-slate-700 border-slate-200'
};

export default function SopClient({ initialSops }: { initialSops: any[] }) {
  const { role, employeeProfile, loading: authLoading } = useAuth() as any;
  const toast = useToast();
  const [sops, setSops] = useState(initialSops || []);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>(['Fermentation', 'QC', 'Sanitation', 'Safety']);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'archive' | 'training' | 'compliance'>('archive');
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [activeSopAction, setActiveSopAction] = useState<any>(null); // For Sign Flow
  const [viewerDoc, setViewerDoc] = useState<{url: string, title: string, forTraining?: boolean} | null>(null);
  
  // For Admin Signatures Modal
  const [showSignaturesModal, setShowSignaturesModal] = useState<any>(null);
  const [signaturesData, setSignaturesData] = useState<any[]>([]);
  const [loadingSignatures, setLoadingSignatures] = useState(false);

  // ESignature Modal
  const [showESignModal, setShowESignModal] = useState(false);

  const { register: regUpload, handleSubmit: handUpload, formState: { errors: upErrors, isSubmitting: isUploading }, reset: resetUpload, watch } = useForm({
    resolver: zodResolver(uploadSchema),
    defaultValues: { title: '', category: 'QC', version: '1.0', effective_date: new Date().toISOString().split('T')[0] }
  });
  const watchedFile = watch('file');

  const fetchSOPs = useCallback(async () => {
    setLoading(true);
    try {
      const [sopsRes, acksRes] = await Promise.all([
        withTimeout(supabase.from('sop_library').select('*').eq('is_active', true).limit(500), 45000, 'SOPs load timed out'),
        employeeProfile?.id ? supabase.from('sop_acknowledgements').select('*').eq('employee_id', employeeProfile.id) : { data: [] }
      ]);
      
      if (sopsRes.error) throw sopsRes.error;
      
      const acksMap = new Map((acksRes.data || []).map((a: any) => [a.sop_id, a]));
      
      const mapped = (sopsRes.data || []).map((sop: any) => ({ 
        ...sop, 
        is_acknowledged: acksMap.has(sop.id),
        ack_data: acksMap.get(sop.id)
      }));
      setSops(mapped);
    } catch (err) { console.error('Fetch SOPs error:', err); }
    finally { setLoading(false); }
  }, [supabase, employeeProfile]);

  useEffect(() => { 
    if (employeeProfile) {
      supabase.from('app_settings').select('value').eq('key', 'document_categories').single()
        .then(({ data }) => { 
          if (data?.value) {
            try {
              const parsed = JSON.parse(data.value);
              setCategories(parsed.map((c: any) => c.label));
            } catch (e) {}
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
  }, [employeeProfile, fetchSOPs, initialSops, supabase]);

  const acknowledgeSOP = async (pinVerified: boolean) => {
    if (!activeSopAction) return;
    try {
      const signatureText = `I, ${employeeProfile?.full_name}, confirm I have read, understood, and will comply with ${activeSopAction.sop_id} (${activeSopAction.title}) v${activeSopAction.version}. This signature is legally binding.`;
      
      const res = await fetch(`/api/sops/${activeSopAction.id}/acknowledge`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          employee_id: employeeProfile.id, 
          signature_text: signatureText,
          pin_verified: pinVerified // Will be saved if DB supports it
        }) 
      });
      if (res.ok) { 
        toast.success(`Successfully acknowledged ${activeSopAction.title}`);
        setActiveSopAction(null); 
        setShowESignModal(false);
        fetchSOPs(); 
      } else {
        toast.error("Failed to sign SOP. Please try again.");
      }
    } catch (err) {
      toast.error("Error acknowledging SOP: " + err.message);
    }
  };

  const handleDeleteSOP = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SOP? This action cannot be undone and will delete all associated signatures.')) return;
    try {
      const res = await fetch(`/api/sops/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      toast.success('SOP deleted successfully');
      fetchSOPs();
    } catch (err) {
      toast.error('Error deleting SOP');
    }
  };

  const handleViewSignatures = async (sopId: string) => {
    setShowSignaturesModal(sopId);
    setLoadingSignatures(true);
    setSignaturesData([]);
    try {
      const res = await fetch(`/api/sops/${sopId}/acknowledgements`);
      const data = await res.json();
      if (res.ok) setSignaturesData(data.data || []);
      else toast.error('Failed to load signatures');
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
          effective_date: data.effective_date, // Pass effective_date
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

  const isAdmin = ['admin','ceo','cto'].includes(role);
  const canUpload = ['admin','ceo','cto','qa_manager','research_fellow'].includes(role);

  // Derived State
  const totalSops = sops.length;
  const trainedCount = sops.filter(s => s.is_acknowledged).length;
  const pendingCount = totalSops - trainedCount;

  const filteredSops = [...sops]
    .filter((sop: any) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesCategory = categoryFilter === 'All' || sop.category === categoryFilter;
      const matchesSearch = !q || [sop.sop_id, sop.title, sop.category, sop.version].some(value => String(value || '').toLowerCase().includes(q));
      
      // Tab specific filtering
      if (activeTab === 'training') return matchesSearch && matchesCategory && sop.is_acknowledged;
      
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => Number(a.is_acknowledged) - Number(b.is_acknowledged) || String(a.title).localeCompare(String(b.title)));

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <Skeleton className="h-10 w-1/3 mb-8"/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl"/>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">SOP & Protocols</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">Training library and compliance tracker</p>
        </div>
        {canUpload && (
          <button onClick={() => setShowUploadModal(true)} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-xs uppercase tracking-wider">
            <UploadCloud className="w-4 h-4 mr-2" /> Upload Protocol
          </button>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Protocols</p><p className="text-2xl font-black text-slate-800">{totalSops}</p></div>
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><BookOpen className="w-5 h-5"/></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div><p className="text-xs font-bold text-emerald-600/80 uppercase tracking-wider">Trained</p><p className="text-2xl font-black text-emerald-700">{trainedCount}</p></div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><CheckCircle className="w-5 h-5"/></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between relative overflow-hidden">
          <div><p className="text-xs font-bold text-amber-600/80 uppercase tracking-wider">Requires Action</p><p className="text-2xl font-black text-amber-700">{pendingCount}</p></div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-amber-600 ${pendingCount > 0 ? 'bg-amber-100 animate-pulse' : 'bg-amber-50'}`}><AlertTriangle className="w-5 h-5"/></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button onClick={() => setActiveTab('archive')} className={`pb-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'archive' ? 'border-navy text-navy' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>📚 Protocol Archive</button>
        <button onClick={() => setActiveTab('training')} className={`pb-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'training' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>🗂️ My Training Record</button>
        {isAdmin && <button onClick={() => setActiveTab('compliance')} className={`pb-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'compliance' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>📊 Compliance Tracker</button>}
      </div>

      {/* Filters */}
      {activeTab !== 'compliance' && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search protocols..." className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-accent transition-all" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white font-bold text-slate-600 outline-none hover:border-slate-300 transition-all min-w-[150px]">
            <option value="All">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'archive' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredSops.length === 0 ? (
            <div className="col-span-full py-20 text-center text-sm font-bold text-slate-400">No protocols found.</div>
          ) : filteredSops.map((sop: any) => {
            const catColors = CATEGORY_COLORS[sop.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS['default'];
            return (
              <div key={sop.id} className={`bg-white rounded-2xl border shadow-sm flex flex-col transition-all hover:shadow-md hover:border-slate-300 overflow-hidden ${!sop.is_acknowledged ? 'border-amber-200/60' : 'border-slate-200'}`}>
                {/* Colored Top Bar */}
                <div className={`h-1.5 w-full ${catColors.split(' ')[0]}`} />
                
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-mono text-[10px] font-black tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">{sop.sop_id}</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border ${catColors}`}>{sop.category}</span>
                  </div>
                  
                  <h3 className="text-base font-black text-slate-900 mb-4 leading-snug line-clamp-2" title={sop.title}>{sop.title}</h3>
                  
                  <div className="mt-auto space-y-2 mb-4">
                    <div className="flex justify-between text-xs font-semibold text-slate-500">
                      <span>Version {sop.version}</span>
                      <span>Eff: {sop.effective_date ? new Date(sop.effective_date).toLocaleDateString() : 'Draft'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                    <button 
                      onClick={() => setViewerDoc({url: sop.document_url, title: sop.title})} 
                      className="w-full flex items-center justify-center px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-colors border border-slate-200"
                    >
                      <BookOpen className="w-4 h-4 mr-2"/> Read Document
                    </button>
                    
                    {!sop.is_acknowledged ? (
                      <button onClick={() => { setActiveSopAction(sop); setViewerDoc({url: sop.document_url, title: sop.title, forTraining: true}); }} className="w-full flex items-center justify-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-colors shadow-sm shadow-amber-500/20">
                        <AlertTriangle className="w-4 h-4 mr-2"/> Begin Training
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center px-4 py-2 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-100 cursor-default">
                        <CheckCircle className="w-4 h-4 mr-2"/> Trained
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'training' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-black text-slate-900">Your Training History</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredSops.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">You haven&apos;t completed any training yet.</div>
            ) : filteredSops.map((sop: any) => (
              <div key={sop.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{sop.sop_id}</span>
                    <span className="text-sm font-black text-slate-900">{sop.title}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">Version {sop.version} • {sop.category}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end text-emerald-600 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Signed</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    {sop.ack_data?.acknowledged_at ? new Date(sop.ack_data.acknowledged_at).toLocaleString() : 'Date unknown'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'compliance' && isAdmin && (
        <div className="space-y-4">
          {sops.map((sop: any) => {
            // Very naive calculation for demo: assume target audience is all employees for now.
            // In a real scenario, this would query exactly who is targeted.
            const totalTarget = employeesList.length;
            const trained = sop.is_acknowledged ? 1 : 0; // Fake for now, admin compliance needs a full endpoint or joined data
            // We'll rely on the modal for accurate lists.
            return (
              <div key={sop.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-black text-slate-900 text-sm mb-1">{sop.sop_id} - {sop.title}</h3>
                  <p className="text-xs font-semibold text-slate-500">Effective: {sop.effective_date ? new Date(sop.effective_date).toLocaleDateString() : 'N/A'} • {sop.category}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleViewSignatures(sop.id)} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center">
                    <Users className="w-4 h-4 mr-2" /> View Signatures
                  </button>
                  <button onClick={() => handleDeleteSOP(sop.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative">
            <button onClick={() => setShowUploadModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors"><X className="w-5 h-5"/></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-navy/10 rounded-xl flex items-center justify-center text-navy"><UploadCloud className="w-5 h-5" /></div>
              <h2 className="text-xl font-black text-slate-900">Upload Protocol</h2>
            </div>
            
            <form onSubmit={handUpload(onUploadSubmit)} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Document Title</label>
                <input type="text" {...regUpload('title')} className="w-full border-2 border-slate-200 rounded-xl p-3 outline-none focus:border-navy font-semibold text-sm transition-colors" placeholder="e.g. Centrifuge Operation Guidelines" />
                {upErrors.title && <p className="text-red-500 text-xs mt-1 font-semibold">{String(upErrors.title.message)}</p>}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                  <select {...regUpload('category')} className="w-full border-2 border-slate-200 rounded-xl p-3 outline-none focus:border-navy bg-white text-sm font-semibold transition-colors">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Version</label>
                  <input type="text" {...regUpload('version')} className="w-full border-2 border-slate-200 rounded-xl p-3 outline-none focus:border-navy text-sm font-semibold transition-colors" placeholder="1.0" />
                  {upErrors.version && <p className="text-red-500 text-xs mt-1 font-semibold">{String(upErrors.version.message)}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective Date</label>
                  <input type="date" {...regUpload('effective_date')} className="w-full border-2 border-slate-200 rounded-xl p-3 outline-none focus:border-navy text-sm font-semibold transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">File Document (PDF)</label>
                <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-6 bg-slate-50 hover:bg-slate-100 transition-colors text-center group">
                  <input type="file" accept=".pdf" {...regUpload('file')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2 group-hover:text-navy transition-colors" />
                  <p className="text-sm font-bold text-slate-700">
                    {watchedFile && watchedFile.length > 0 ? watchedFile[0].name : "Click or drag file to upload"}
                  </p>
                  <p className="text-xs font-semibold text-slate-400 mt-1">Supports PDF format</p>
                </div>
                {upErrors.file && <p className="text-red-500 text-xs mt-1 font-semibold">{String(upErrors.file.message)}</p>}
              </div>

              <div className="pt-2">
                <button disabled={isUploading} type="submit" className="w-full bg-navy hover:bg-navy-hover text-white font-black py-4 rounded-xl transition-all shadow-lg hover:shadow-xl text-sm uppercase tracking-widest">{isUploading ? 'Publishing...' : 'Publish Protocol'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Signatures Modal */}
      {showSignaturesModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 relative shadow-2xl overflow-y-auto max-h-[85vh]">
            <button onClick={() => setShowSignaturesModal(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Acknowledgements</h2>
            <p className="text-sm font-semibold text-slate-500 mb-6">Staff who have completed this training.</p>
            
            {loadingSignatures ? (
              <div className="py-12 text-center text-sm font-bold text-slate-400">Loading signatures...</div>
            ) : signaturesData.length === 0 ? (
              <div className="py-12 text-center text-sm font-bold text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">No signatures found.</div>
            ) : (
              <div className="space-y-3">
                {signaturesData.map((sig, idx) => (
                  <div key={idx} className="flex justify-between items-center p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-black text-sm uppercase">
                        {sig.employees?.initials || sig.employees?.full_name?.substring(0, 2) || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{sig.employees?.full_name || 'Unknown User'}</p>
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">{sig.employees?.role?.replace('_', ' ') || 'Staff'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Signed</p>
                      <p className="text-xs font-bold text-slate-800">{new Date(sig.acknowledged_at).toLocaleDateString()}</p>
                      {sig.pin_verified && (
                         <p className="text-[10px] font-bold text-emerald-600 flex justify-end items-center gap-1 mt-0.5"><Lock className="w-3 h-3"/> PIN Verified</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Secure Viewer Modal */}
      {viewerDoc && (
        <SecureViewerModal 
          url={viewerDoc.url} 
          title={viewerDoc.title} 
          allowDownload={false}
          onClose={() => {
             const wasTraining = viewerDoc.forTraining;
             setViewerDoc(null);
             if (wasTraining) {
               // Proceed to signing step
               setTimeout(() => setShowESignModal(true), 300);
             }
          }} 
        />
      )}

      {/* E-Signature Modal for Training */}
      {showESignModal && activeSopAction && (
        <ESignatureModal
          isOpen={showESignModal}
          onClose={() => { setShowESignModal(false); setActiveSopAction(null); }}
          onSign={async () => { await acknowledgeSOP(true); }}
          title={`Sign: ${activeSopAction.title}`}
        />
      )}
    </div>
  );
}
