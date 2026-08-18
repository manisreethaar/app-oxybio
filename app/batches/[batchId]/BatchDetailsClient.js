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
import HarvestPanel from './components/HarvestPanel';
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

  // Decouple viewed stage from active stage for navigation
  const [viewedStage, setViewedStage] = useState(activePhase);

  // Auto-jump to the active phase when it changes
  useEffect(() => {
    setViewedStage(activePhase);
  }, [activePhase]);

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
  
  if (activePhase === 'harvest' || activePhase === 'downstream') {
    stepperStages.push({ id: 'harvest', label: 'Harvest' });
  }

  // A stage is "past" if its index is less than the activePhase index (not viewedStage)
  const activePhaseIndex = stepperStages.findIndex(s => s.id === activePhase);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 fade-in">

      {/* ── HEADER ── */}
      <div className="card p-5 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/batches')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4"/>
            </button>
            <div className="w-10 h-10 bg-navy/10 rounded-xl flex items-center justify-center shrink-0">
              <Beaker className="w-5 h-5 text-navy"/>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {batch.batch_number || batch.batch_id || 'Batch'}
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  batch.status === 'released' ? 'bg-emerald-100 text-emerald-700' :
                  batch.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  batch.status === 'active'   ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{batch.status || 'Active'}</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                {batch.experiment_type && <span className="mr-2 font-black text-navy">{batch.experiment_type}</span>}
                {batch.start_date ? `Started ${dayjs(batch.start_date).format('DD MMM YYYY')}` : 'Not started'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isPending && (
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold">
                <RefreshCw className="w-3 h-3 animate-spin"/> Syncing
              </div>
            )}
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recipe</p>
              <p className="font-black text-sm text-slate-800">
                {batch.formulations?.name || <span className="text-slate-400 font-medium">No recipe</span>}
                {batch.formulations?.version && <span className="text-slate-400 font-medium ml-1">v{batch.formulations.version}</span>}
              </p>
            </div>
            {batch.planned_volume_ml && (
              <div className="text-right pl-3 border-l border-slate-200">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest" title="Target Overall Batch Volume">Batch Volume</p>
                <p className="font-black text-sm text-slate-800">{batch.planned_volume_ml} mL</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DYNAMIC STEPPER ── */}
      <div className="card p-4 overflow-x-auto shadow-sm">
        <div className="flex items-center min-w-max px-2">
          {stepperStages.map((stage, idx) => {
            const isCurrentActive = stage.id === activePhase;
            const isCurrentlyViewed = stage.id === viewedStage;
            const isPast = activePhaseIndex !== -1 && idx < activePhaseIndex;
            const isFuture = activePhaseIndex !== -1 && idx > activePhaseIndex;
            
            return (
              <div key={stage.id} className="flex items-center">
                <div 
                  className={`flex flex-col items-center gap-2 ${isCurrentlyViewed ? 'opacity-100' : isPast ? 'opacity-80' : 'opacity-40'} ${!isFuture ? 'cursor-pointer hover:opacity-100' : ''}`}
                  onClick={() => {
                    if (!isFuture) setViewedStage(stage.id);
                  }}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-sm ${
                    isCurrentlyViewed ? 'bg-navy border-navy text-white ring-4 ring-navy/10' :
                    isPast    ? 'bg-emerald-50 border-emerald-500 text-emerald-600' :
                                'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    {isPast && !isCurrentlyViewed ? <CheckCircle2 className="w-5 h-5"/> : <span className="font-black text-sm">{idx + 1}</span>}
                  </div>
                  <span className={`text-xs font-black uppercase tracking-wider ${isCurrentlyViewed ? 'text-navy' : isPast ? 'text-emerald-700' : 'text-slate-400'}`}>
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
        {viewedStage === 'protocol' ? (
          <ProtocolSetupPanel
            key="protocol"
            batch={batch}
            sops={data.sops}
            onComplete={() => handleStageTransition('seed_1')}
          />
        ) : viewedStage === 'production' ? (
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
            onTransfer={() => handleStageTransition('harvest')}
            onDataChange={handleDataChange}
          />
        ) : viewedStage === 'harvest' ? (
          <HarvestPanel
            key="harvest"
            batch={batch}
            activeFlask={data.flasks.find(f => f.current_stage === 'harvest' || f.current_stage === 'straining') || data.flasks[0]}
            employees={data.employees}
            employeeProfile={employeeProfile}
            role={employeeProfile?.role}
            supabase={supabase}
            onDataSaved={handleDataChange}
            onAdvanceFlaskStage={async (targetStage, warnings) => {
              if (warnings?.length) toast.warn(warnings[0]);
              // the panel internally updates flask stage. Here we just advance the batch.
              await handleStageTransition('downstream');
            }}
          />
        ) : (
          <SeedPhasePanel
            key={viewedStage}
            batch={batch}
            stageType={viewedStage}
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
