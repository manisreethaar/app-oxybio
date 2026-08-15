'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ArrowLeft, RefreshCw, Beaker, FileText, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';

import ProtocolSetupPanel from './components/ProtocolSetupPanel';
import SeedPhasePanel from './components/SeedPhasePanel';
import ProductionPhasePanel from './components/ProductionPhasePanel';
import LinkedRecordsPanel from '@/components/batches/LinkedRecordsPanel';
import { SEED_TRAIN_STAGE_IDS } from '@/lib/batches/workflowStages';

export default function BatchDetailsPage({ params: { batchId } }) {
  const { employeeProfile, employees, role } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [batch, setBatch] = useState(null);
  const [flasks, setFlasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // advance_flask_stage() rolls batches.current_stage up to whichever flask
  // is least-progressed (inoculation/fermentation/... — never 'production'),
  // so the raw column can't be used alone to decide whether we're still in
  // Seed Train setup or already flask-tracked. The existence of flasks is
  // the reliable signal once Production Explosion has run.
  const fetchBatchData = useCallback(async () => {
    try {
      const [{ data: b, error }, { data: fl, error: flErr }] = await Promise.all([
        supabase
          .from('batches')
          .select(`
            *,
            formulations ( name, version )
          `)
          .eq('id', batchId)
          .maybeSingle(),
        supabase
          .from('batch_flasks')
          .select('id, current_stage, status')
          .eq('batch_id', batchId),
      ]);

      if (error) throw error;
      if (flErr) throw flErr;
      setBatch(b);
      setFlasks(fl || []);
    } catch (err) {
      toast.error('Failed to load batch: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [batchId, toast]);

  useEffect(() => {
    fetchBatchData();
  }, [fetchBatchData]);

  if (loading) return <div className="p-8 text-center text-slate-400 animate-pulse">Loading batch...</div>;
  if (!batch) return <div className="p-8 text-center text-red-500 font-bold">Batch not found.</div>;

  // Derive active phase. Flasks existing is the reliable signal that we're
  // past Seed Train setup — batch.current_stage rolls up to flask-level
  // values (inoculation, fermentation, ...) once flasks start advancing,
  // so it can't be trusted alone once Production Explosion has run.
  let activePhase;
  if (flasks.length > 0) {
    activePhase = 'production';
  } else if (['seed_1', 'seed_2', 'seed_3'].includes(batch.current_stage)) {
    activePhase = batch.current_stage;
  } else {
    activePhase = 'protocol';
  }

  const phaseIndex = SEED_TRAIN_STAGE_IDS.indexOf(activePhase);
  
  // Stages for the top stepper
  const stepperStages = [
    { id: 'protocol', label: 'Protocol' },
    { id: 'seed_1', label: 'Seed 1' },
    { id: 'seed_2', label: 'Seed 2' },
    { id: 'seed_3', label: 'Seed 3' },
    { id: 'production', label: 'Production' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 fade-in">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 card p-6 bg-gradient-to-r from-navy to-slate-800 text-white shadow-lg border-0">
        <div>
          <button onClick={() => router.push('/batches')} className="text-white/60 hover:text-white mb-4 flex items-center gap-1.5 text-xs font-black tracking-widest uppercase transition-colors">
            <ArrowLeft className="w-4 h-4"/> Back to Batches
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
              <Beaker className="w-5 h-5 text-emerald-400"/>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{batch.batch_number}</h1>
              <p className="text-white/70 text-sm font-semibold mt-0.5">
                Upstream Processing • Started {dayjs(batch.start_date).format('DD MMM YYYY')}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
          <p className="text-xs text-white/50 font-bold uppercase mb-1 tracking-widest">Recipe</p>
          <p className="font-black text-sm">{batch.formulations?.name || 'Unknown'} <span className="text-white/50 font-medium">v{batch.formulations?.version}</span></p>
        </div>
      </div>

      {/* ── SEED TRAIN STEPPER ── */}
      <div className="card p-4 overflow-x-auto shadow-sm">
        <div className="flex items-center min-w-max px-2">
          {stepperStages.map((stage, idx) => {
            const isCurrent = stage.id === activePhase;
            const isPast = idx < phaseIndex;
            return (
              <div key={stage.id} className="flex items-center">
                <div className={`flex flex-col items-center gap-2 ${isCurrent ? 'opacity-100' : isPast ? 'opacity-70' : 'opacity-40'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-sm ${
                    isCurrent ? 'bg-navy border-navy text-white ring-4 ring-navy/10' :
                    isPast ? 'bg-emerald-50 border-emerald-500 text-emerald-600' :
                    'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    {isPast ? <CheckCircle2 className="w-5 h-5" /> : <span className="font-black text-sm">{idx + 1}</span>}
                  </div>
                  <span className={`text-xs font-black uppercase tracking-wider ${isCurrent ? 'text-navy' : isPast ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {stage.label}
                  </span>
                </div>
                {idx < stepperStages.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-2 ${isPast ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="mt-8">
        {activePhase === 'protocol' ? (
          <ProtocolSetupPanel 
            batch={batch} 
            supabase={supabase} 
            onComplete={fetchBatchData} 
          />
        ) : activePhase === 'production' ? (
          <ProductionPhasePanel
            key={activePhase}
            batch={batch}
            employees={employees}
            employeeProfile={employeeProfile}
            role={role}
            supabase={supabase}
            onComplete={fetchBatchData}
          />
        ) : (
          <SeedPhasePanel 
            key={activePhase}
            batch={batch} 
            stageType={activePhase} 
            employees={employees}
            employeeProfile={employeeProfile}
            supabase={supabase}
            onComplete={fetchBatchData}
          />
        )}
      </div>

      <LinkedRecordsPanel batch={batch} />

    </div>
  );
}
