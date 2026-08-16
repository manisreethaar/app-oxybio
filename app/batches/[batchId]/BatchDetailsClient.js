'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ArrowLeft, Beaker, CheckCircle2, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';

import ProtocolSetupPanel from './components/ProtocolSetupPanel';
import SeedPhasePanel from './components/SeedPhasePanel';
import ProductionPhasePanel from './components/ProductionPhasePanel';
import useBatchRealtime from './useBatchRealtime';

export default function BatchDetailsClient({ batchId, initialData }) {
  const { employeeProfile } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  // All state is derived from initialData — panels read from this
  const [data, setData] = useState(initialData);

  // Keep local state in sync with initialData when it changes (after server reval)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // Realtime WebSocket payload handler
  const handleRealtimePayload = useCallback((payload) => {
    console.log('[Realtime Received]', payload);
    const { table, eventType, new: newRow } = payload;
    
    // We only handle INSERT and UPDATE for patching (DELETE is rare for these logs, handled by refresh)
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      setData(prev => {
        const nextState = { ...prev };
        if (table === 'batches') {
          nextState.batch = { ...prev.batch, ...newRow };
        } else if (table === 'batch_seed_trains') {
          const exists = prev.seedTrains.some(s => s.id === newRow.id);
          nextState.seedTrains = exists 
            ? prev.seedTrains.map(s => s.id === newRow.id ? { ...s, ...newRow } : s)
            : [...prev.seedTrains, newRow];
        } else if (table === 'batch_flasks') {
          const exists = prev.flasks.some(f => f.id === newRow.id);
          nextState.flasks = exists
            ? prev.flasks.map(f => f.id === newRow.id ? { ...f, ...newRow } : f)
            : [...prev.flasks, newRow];
        } else if (table === 'batch_fermentation_readings') {
          const exists = prev.fermentationReadings.some(r => r.id === newRow.id);
          nextState.fermentationReadings = exists
            ? prev.fermentationReadings.map(r => r.id === newRow.id ? { ...r, ...newRow } : r)
            : [...prev.fermentationReadings, newRow];
        }
        return nextState;
      });
    }
    
    // Always trigger a silent server revalidation for absolute deep consistency (foreign keys etc)
    refresh();
  }, [refresh]);

  // Subscribe to Realtime
  useBatchRealtime(batchId, handleRealtimePayload);

  // Called by panels after a successful stage transition
  const handleStageTransition = useCallback(async (nextStage) => {
    // Optimistic update — UI switches instantly
    setData(prev => ({
      ...prev,
      batch: { ...prev.batch, current_stage: nextStage }
    }));
    refresh();
  }, [refresh]);

  const handleDataChange = useCallback(() => {
    refresh();
  }, [refresh]);

  const batch = data.batch;
  const activePhase = batch.current_stage || 'protocol';

  // Build dynamic stepper based on what seed trains actually exist
  // Everyone gets Protocol and Seed 1. Seed 2 and 3 only show up if instantiated. Everyone gets Production.
  const seedTrains = data.seedTrains || [];
  
  const stepperStages = [{ id: 'protocol', label: 'Protocol' }];
  
  // Always show Seed 1 if past protocol
  if (seedTrains.some(s => s.stage_type === 'seed_1') || activePhase !== 'protocol') {
    stepperStages.push({ id: 'seed_1', label: 'Seed 1' });
  }
  
  if (seedTrains.some(s => s.stage_type === 'seed_2') || activePhase === 'seed_2') {
    stepperStages.push({ id: 'seed_2', label: 'Seed 2' });
  }
  
  if (seedTrains.some(s => s.stage_type === 'seed_3') || activePhase === 'seed_3') {
    stepperStages.push({ id: 'seed_3', label: 'Seed 3' });
  }
  
  // Production is always the end goal
  if (activePhase !== 'protocol') {
    stepperStages.push({ id: 'production', label: 'Production' });
  }

  const phaseIndex = stepperStages.findIndex(s => s.id === activePhase);

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
              <h1 className="text-2xl font-black tracking-tight">{batch.batch_number || batch.batch_id}</h1>
              <p className="text-white/70 text-sm font-semibold mt-0.5">
                Upstream Processing • {batch.start_date ? `Started ${dayjs(batch.start_date).format('DD MMM YYYY')}` : 'Not started'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isPending && (
            <div className="flex items-center gap-2 text-white/60 text-xs font-bold">
              <RefreshCw className="w-3 h-3 animate-spin"/> Syncing...
            </div>
          )}
          <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
            <p className="text-xs text-white/50 font-bold uppercase mb-1 tracking-widest">Recipe</p>
            <p className="font-black text-sm">{batch.formulations?.name || 'Not set'} {batch.formulations?.version ? <span className="text-white/50 font-medium">v{batch.formulations.version}</span> : ''}</p>
          </div>
        </div>
      </div>

      {/* ── DYNAMIC STEPPER ── */}
      <div className="card p-4 overflow-x-auto shadow-sm">
        <div className="flex items-center min-w-max px-2">
          {stepperStages.map((stage, idx) => {
            const isCurrent = stage.id === activePhase;
            const isPast = phaseIndex !== -1 && idx < phaseIndex;
            return (
              <div key={stage.id} className="flex items-center">
                <div className={`flex flex-col items-center gap-2 ${isCurrent ? 'opacity-100' : isPast ? 'opacity-80' : 'opacity-40'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-sm ${
                    isCurrent ? 'bg-navy border-navy text-white ring-4 ring-navy/10' :
                    isPast    ? 'bg-emerald-50 border-emerald-500 text-emerald-600' :
                                'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    {isPast ? <CheckCircle2 className="w-5 h-5"/> : <span className="font-black text-sm">{idx + 1}</span>}
                  </div>
                  <span className={`text-xs font-black uppercase tracking-wider ${isCurrent ? 'text-navy' : isPast ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {stage.label}
                  </span>
                </div>
                {idx < stepperStages.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-2 transition-colors duration-500 ${isPast || isCurrent ? 'bg-emerald-500' : 'bg-slate-200'}`}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="mt-2">
        {activePhase === 'protocol' ? (
          <ProtocolSetupPanel
            key="protocol"
            batch={batch}
            sops={data.sops}
            onComplete={() => handleStageTransition('seed_1')}
          />
        ) : activePhase === 'production' ? (
          <ProductionPhasePanel
            key="production"
            batch={batch}
            seedTrains={data.seedTrains}
            fermentationReadings={data.fermentationReadings}
            flasks={data.flasks}
            formulations={data.formulations}
            employees={data.employees}
            employeeProfile={employeeProfile}
            standardCurve={data.standardCurve}
            onTransfer={() => handleStageTransition('production')}
            onDataChange={handleDataChange}
          />
        ) : (
          <SeedPhasePanel
            key={activePhase}
            batch={batch}
            stageType={activePhase}
            seedTrains={data.seedTrains}
            fermentationReadings={data.fermentationReadings}
            flasks={data.flasks}
            formulations={data.formulations}
            vials={data.vials}
            employees={data.employees}
            employeeProfile={employeeProfile}
            onTransfer={handleStageTransition}
            onDataChange={handleDataChange}
          />
        )}
      </div>

    </div>
  );
}
