'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { Loader2, ArrowLeft, Save, FileCheck, FileSignature, BookOpen, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function LnbEntryPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  const { employeeProfile, loading: authLoading } = useAuth();
  
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  // Form mutable states
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [methodology, setMethodology] = useState('');
  const [observations, setObservations] = useState('');
  const [conclusions, setConclusions] = useState('');

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
    } catch (err) {
      console.error(err);
      alert('Experiment not found.');
      router.push('/lab-notebook');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) fetchEntry();
  }, [id, fetchEntry]);

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, objective, methodology, observations, conclusions })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchEntry();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleSubmitReview = async () => {
    if (!window.confirm("Are you sure? Once submitted, this notebook entry will be locked for review.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, objective, methodology, observations, conclusions, status: 'Submitted' })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchEntry();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleCountersign = async () => {
    if (!window.confirm("By countersigning, you legally verify this document's contents. Proceed?")) return;
    setSigning(true);
    try {
      const res = await fetch(`/api/lab-notebook/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'countersign' })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchEntry();
    } catch (err) { alert(err.message); }
    finally { setSigning(false); }
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
  const canEdit = isDraft && isAuthor;
  const canCountersign = entry.status === 'Submitted' && 
                         (employeeProfile.role === 'admin' || employeeProfile.role === 'research_fellow') && 
                         entry.author?.id !== employeeProfile.id;

  return (
    <div className="page-container text-gray-900 max-w-5xl mx-auto">
      <Link href="/lab-notebook" className="flex items-center text-xs font-bold text-gray-400 hover:text-navy transition-colors mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Notebook
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex-1 w-full">
          {canEdit ? (
             <input 
               type="text" value={title} onChange={(e) => setTitle(e.target.value)} 
               className="text-3xl font-black text-gray-900 tracking-tight w-full bg-transparent border-b border-transparent hover:border-gray-200 outline-none focus:border-navy transition-colors pb-1"
               placeholder="Experiment Title..."
             />
          ) : (
             <h1 className="text-3xl font-black text-gray-900 tracking-tight">{entry.title}</h1>
          )}
          
          <div className="flex flex-wrap items-center gap-4 mt-3">
             <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-lg">
                <span className={
                  entry.status === 'Draft' ? 'text-amber-600' : 
                  entry.status === 'Submitted' ? 'text-blue-600' : 'text-emerald-600'
                }>{entry.status}</span>
             </div>
             {entry.batches && (
               <div className="flex items-center text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Batch: {entry.batches.batch_id}
               </div>
             )}
             <div className="flex items-center text-xs font-bold text-gray-500">
                <Clock className="w-3.5 h-3.5 mr-1.5" /> {new Date(entry.created_at).toLocaleString()}
             </div>
          </div>
        </div>

        <div className="flex gap-3">
          {canEdit && (
            <>
              <button disabled={saving} onClick={handleSaveDraft} className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-gray-200 transition-all">
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} Save Draft
              </button>
              <button disabled={saving} onClick={handleSubmitReview} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all shadow-sm">
                <FileCheck className="w-4 h-4 mr-1.5" /> Submit for Review
              </button>
            </>
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
           <SectionBox title="Objective" icon={<AlertCircle className="w-4 h-4" />} canEdit={canEdit} value={objective} onChange={setObjective} placeholder="State the purpose of this experiment..." />
           <SectionBox title="Methodology / Protocols" icon={<BookOpen className="w-4 h-4" />} canEdit={canEdit} value={methodology} onChange={setMethodology} placeholder="Detail the steps, reagents, and equipment used..." isLarge />
           <SectionBox title="Detailed Observations" icon={<FileCheck className="w-4 h-4" />} canEdit={canEdit} value={observations} onChange={setObservations} placeholder="Record qualitative and quantitative readings..." isLarge />
           <SectionBox title="Conclusions" icon={<FileSignature className="w-4 h-4" />} canEdit={canEdit} value={conclusions} onChange={setConclusions} placeholder="Summarize findings and next steps..." />
        </div>

        {/* Sidebar Signatures */}
        <div className="space-y-6">
           <div className="surface p-5 border border-gray-100 rounded-2xl bg-white shadow-sm">
              <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] mb-4 uppercase">Chain of Custody</h3>
              
              <div className="mb-6">
                 <p className="text-xs font-bold text-gray-500 uppercase mb-2">Primary Author</p>
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
                       <FileSignature className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-sm font-bold text-gray-900">{entry.author?.full_name}</p>
                       <p className="text-xs font-semibold text-gray-500">{entry.author?.role}</p>
                    </div>
                 </div>
              </div>

              <div className="pt-5 border-t border-gray-100">
                 <p className="text-xs font-bold text-gray-500 uppercase mb-2">Countersigned By</p>
                 {entry.countersigner ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
                         <FileCheck className="w-5 h-5" />
                      </div>
                      <div>
                         <p className="text-sm font-bold text-gray-900">{entry.countersigner.full_name}</p>
                         <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{new Date(entry.countersigned_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                 ) : (
                    <div className="flex items-center gap-3 opacity-50">
                       <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-gray-300" />
                       </div>
                       <p className="text-xs font-bold text-gray-400 italic">Pending Review...</p>
                    </div>
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}

function SectionBox({ title, icon, canEdit, value, onChange, placeholder, isLarge }) {
  return (
    <div className="surface p-0 overflow-hidden border border-gray-200 shadow-sm rounded-2xl bg-white">
       <div className="bg-gray-50/50 px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className="text-navy">{icon}</div>
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">{title}</h3>
       </div>
       <div className="p-1">
         {canEdit ? (
           <textarea 
             value={value} 
             onChange={(e) => onChange(e.target.value)}
             className={`w-full p-4 bg-transparent outline-none resize-none text-sm font-medium text-gray-700 leading-relaxed ${isLarge ? 'h-64' : 'h-32'}`}
             placeholder={placeholder}
           />
         ) : (
           <div className={`w-full p-4 text-sm font-medium text-gray-700 leading-relaxed overflow-y-auto whitespace-pre-wrap ${isLarge ? 'min-h-[16rem]' : 'min-h-[8rem]'}`}>
             {value || <span className="text-gray-400 italic">No {title.toLowerCase()} recorded.</span>}
           </div>
         )}
       </div>
    </div>
  );
}
