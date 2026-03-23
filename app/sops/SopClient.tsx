'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { notifyEmployee } from '@/lib/notifyEmployee';
import { BookOpen, CheckCircle, AlertTriangle, ExternalLink, Mail, X } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
const uploadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.enum(['Fermentation', 'QC', 'Sanitation', 'Safety']),
  version: z.string().min(1, "Version is required"),
  file: z.any().refine((files) => files && files.length > 0, "PDF file is required")
});

export default function SopClient({ initialSops }: { initialSops: any[] }) {
  const { role, employeeProfile, loading: authLoading } = useAuth() as any;
  const [sops, setSops] = useState(initialSops || []);
  const [loading, setLoading] = useState(false);
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
      if (!initialSops || initialSops.length === 0) {
        fetchSOPs(); 
      }
    }
  }, [employeeProfile, fetchSOPs, initialSops]);

  const [showAckModal, setShowAckModal] = useState<any>(null);
  const [signatureText, setSignatureText] = useState("");
  const [submittingAck, setSubmittingAck] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);

  const handleQuizSubmit = () => {
    const questions = showAckModal.quiz_questions || [
      { q: "What is the primary objective of this procedure?", options: ["Compliance only", "Safety and Quality", "Speed of execution", "Documentation only"], a: 1 },
      { q: "Which department is responsible for oversight?", options: ["Marketing", "Sales", "Quality Assurance", "Logistics"], a: 2 },
      { q: "When should deviations be reported?", options: ["End of week", "Immediately", "Never", "Only if noticed by admin"], a: 1 }
    ];

    let score = 0;
    userAnswers.forEach((ans, idx) => { if (ans === questions[idx]?.a) score += 1; });
    const finalPercent = (score / questions.length) * 100;
    setQuizScore(finalPercent);
    if (finalPercent === 100) {
      // Success state handled in UI
    } else {
      alert(`Validation Failure: ${finalPercent}%. A 100% score is required to proceed with digital acknowledgment.`);
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
          signature_text: signatureText,
          quiz_score: quizScore
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
        alert("Failed to sign SOP. Please try again.");
      }
    } catch (err) {
      alert("Error acknowledging SOP: " + err.message);
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
      alert("Error: " + err.message);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="page-container space-y-6">
        <div className="flex justify-between items-center"><Skeleton width={200} height={30}/> <Skeleton width={100} height={40}/></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl"/>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SOP Library</h1>
          <p className="text-sm text-gray-500 mt-1">Official lab protocols and signatures.</p>
        </div>
        {role === 'admin' && <button onClick={() => setShowUploadModal(true)} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider">Upload Doc</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sops.map(sop => (
          <div key={sop.id} className={`surface p-5 flex flex-col hover:border-gray-300 transition-colors ${!sop.is_acknowledged ? 'border-blue-200 bg-blue-50/10' : ''}`}>
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono text-xs font-bold tracking-wider text-navy bg-gray-100 px-1.5 py-0.5 rounded-md border border-gray-200">{sop.sop_id}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{sop.category}</span>
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-2 leading-tight flex-1">{sop.title}</h3>
            <div className="grid grid-cols-2 gap-2 mb-4 text-[11px] border-t border-gray-100 pt-3">
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

            {!quizStarted && quizScore < 100 && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs font-bold text-blue-900 mb-2">Pre-Signature Validation</p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">To ensure compliance, you must complete a brief micro-quiz on this SOP before signing. A 100% score is required.</p>
                </div>
                <button onClick={() => setQuizStarted(true)} className="w-full py-3 bg-navy text-white text-xs font-black uppercase rounded-xl shadow-lg hover:shadow-navy/20 transition-all">Start Validation Quiz</button>
              </div>
            )}

            {quizStarted && quizScore < 100 && (
              <div className="space-y-6">
                {(showAckModal.quiz_questions || [
                  { q: "What is the primary objective of this procedure?", options: ["Compliance only", "Safety and Quality", "Speed of execution", "Documentation only"], a: 1 },
                  { q: "Which department is responsible for oversight?", options: ["Marketing", "Sales", "Quality Assurance", "Logistics"], a: 2 },
                  { q: "When should deviations be reported?", options: ["End of week", "Immediately", "Never", "Only if noticed by admin"], a: 1 }
                ]).map((q: any, qIdx: number) => (
                  <div key={qIdx} className="space-y-2">
                    <p className="text-xs font-bold text-gray-700">{qIdx + 1}. {q.q}</p>
                    <div className="grid gap-2">
                      {q.options.map((opt, oIdx) => (
                        <button 
                          key={oIdx} 
                          onClick={() => {
                            const newAns = [...userAnswers];
                            newAns[qIdx] = oIdx;
                            setUserAnswers(newAns);
                          }}
                          className={`text-left p-2.5 rounded-lg text-xs font-medium border transition-all ${userAnswers[qIdx] === oIdx ? 'bg-navy text-white border-navy scale-[1.02]' : 'bg-white text-gray-600 border-gray-200 hover:border-navy/30'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={handleQuizSubmit} className="w-full py-3 bg-emerald-600 text-white text-xs font-black uppercase rounded-xl">Submit Answers</button>
              </div>
            )}

            {quizScore === 100 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="bg-emerald-500 rounded-full p-1"><CheckCircle className="w-5 h-5 text-white"/></div>
                  <div><p className="text-xs font-black text-emerald-900 uppercase">Validated</p><p className="text-[10px] text-emerald-700">100% Score achieved. Signature unlocked.</p></div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Mail className="w-3 h-3"/> Signature Statement</label>
                  <textarea value={signatureText} onChange={(e) => setSignatureText(e.target.value)} rows={3} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-accent resize-none" />
                </div>
                <button disabled={submittingAck} onClick={acknowledgeSOP} className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider flex items-center justify-center gap-1">{submittingAck ? "Processing..." : "Sign Procedure"}</button>
              </div>
            )}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Category</label>
                  <select {...regUpload('category')} className="w-full border border-gray-200 rounded-lg p-2 outline-none bg-white text-sm font-semibold"><option value="Fermentation">Fermentation</option><option value="QC">QC</option><option value="Sanitation">Sanitation</option><option value="Safety">Safety</option></select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Version</label>
                  <input type="text" {...regUpload('version')} className="w-full border border-gray-200 rounded-lg p-2 outline-none text-sm font-semibold" />
                  {upErrors.version && <p className="text-red-500 text-xs mt-1">{String(upErrors.version.message)}</p>}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1">File (PDF)</label>
                <input type="file" accept=".pdf" {...regUpload('file')} className="w-full border border-gray-200 rounded-lg p-2 bg-gray-50 text-xs" />
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
