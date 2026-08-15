import { useMemo } from 'react';
import {
  ALL_STAGE_IDS,
  UPSTREAM_STAGE_IDS,
  DOWNSTREAM_STAGE_IDS,
  normalizeStage,
  visibleWorkflowStage
} from './workflowStages';

export function useBatchWorkflow(batch, flasks = []) {
  return useMemo(() => {
    if (!batch) return null;

    const status = (batch.status || '').toLowerCase();
    const currentStage = visibleWorkflowStage(batch.current_stage);
    
    const isTerminalStatus = ['released', 'rejected'].includes(status);
    const isTerminalStage = ['released', 'rejected'].includes(currentStage);
    const isTerminal = isTerminalStatus || isTerminalStage;
    
    const isScheduled = ['planned', 'scheduled'].includes(status) && !currentStage;
    
    // 1. Calculate disposition based on flasks (if any)
    let disposition = status;
    const activeFlasks = flasks.filter(f => (f.status || '').toLowerCase() !== 'rejected');
    
    if (isTerminal) {
      disposition = status;
      if (isTerminalStage) disposition = currentStage;
    } else if (flasks.length > 0) {
      if (activeFlasks.length === 0) {
        disposition = 'rejected';
      } else {
        const allLiveReleased = activeFlasks.every(f => 
          (f.status || '').toLowerCase() === 'released' || 
          visibleWorkflowStage(f.current_stage) === 'released'
        );
        if (allLiveReleased) disposition = 'released';
      }
    }

    // 2. Effective Stage Calculation (Slowest flask dictates batch stage)
    let effectiveStage = currentStage;
    const BATCH_ONLY_STAGES = ['media_prep', 'sterilisation'];
    
    if (isScheduled) {
      effectiveStage = null;
    } else if (!BATCH_ONLY_STAGES.includes(currentStage) && activeFlasks.length > 0) {
      const slowestFlaskIdx = activeFlasks.reduce((best, f) => {
        const fStage = visibleWorkflowStage(f.current_stage);
        const idx = ALL_STAGE_IDS.indexOf(fStage);
        if (idx < 0) return ALL_STAGE_IDS.indexOf('inoculation'); // Fallback
        return Math.min(best, idx);
      }, ALL_STAGE_IDS.length - 1);
      
      if (slowestFlaskIdx >= 0 && slowestFlaskIdx < ALL_STAGE_IDS.length) {
        effectiveStage = ALL_STAGE_IDS[slowestFlaskIdx];
      }
    } else if (isTerminal) {
       effectiveStage = disposition;
    }

    // 3. Display Status label for UI
    let displayStatus = disposition;
    if (!['released', 'rejected'].includes(disposition)) {
       if (isScheduled) displayStatus = 'scheduled';
       else if (BATCH_ONLY_STAGES.includes(effectiveStage)) displayStatus = status;
       else if (effectiveStage === 'fermentation') displayStatus = 'fermenting';
       else if (effectiveStage === 'qc_hold') displayStatus = 'qc-hold';
       else if (effectiveStage === 'released') displayStatus = 'released';
       else if (['harvest', 'straining'].includes(effectiveStage)) displayStatus = 'processing';
       else displayStatus = status;
    }

    const effectiveIdx = ALL_STAGE_IDS.indexOf(effectiveStage);
    const isUpstream = effectiveIdx >= 0 && effectiveIdx <= ALL_STAGE_IDS.indexOf('harvest');
    const isDownstream = effectiveIdx > ALL_STAGE_IDS.indexOf('harvest') || ['released', 'rejected'].includes(disposition);

    // Ensure we know if the batch is in a flask-tracked stage (post-sterilisation)
    const isFlaskTrackedStage = effectiveIdx > ALL_STAGE_IDS.indexOf('sterilisation') && !['released', 'rejected'].includes(disposition);

    return {
      status: disposition,
      currentStage: effectiveStage,
      displayStatusLabel: displayStatus,
      isScheduled,
      isTerminal: ['released', 'rejected'].includes(disposition),
      isUpstream,
      isDownstream,
      isFlaskTrackedStage,
      activeFlasks,
      allFlasks: flasks,
      effectiveStageIndex: effectiveIdx,
    };
  }, [batch, flasks]);
}
