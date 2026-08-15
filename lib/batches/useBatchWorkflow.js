'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { normalizeStage, visibleWorkflowStage, stageRank } from './workflowStages';

// Shared fetch/derive-state/transition-handler logic for the Batches
// (upstream) and Downstream detail pages — previously ~97% duplicated
// between the two page.js files. `module` picks the two small formulas
// that genuinely differ (whether flasks are tracked individually yet, and
// whether the batch can still be "scheduled"); everything else behaves
// identically for both.
export function useBatchWorkflow({ batchId, module, listHref, stageChecklistMap }) {
  const searchParams = useSearchParams();
  const preselectFlaskId = searchParams.get('flask');
  const { role, employeeProfile, canDo, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [batch, setBatch] = useState(null);
  const [flasks, setFlasks] = useState([]);
  const [transitions, setTransitions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [availableStock, setAvailableStock] = useState([]);
  const [flaskEndpoints, setFlaskEndpoints] = useState([]);
  const [lnbCount, setLnbCount] = useState(0);
  const [lnbEntryId, setLnbEntryId] = useState(null);
  const [lnbByFlask, setLnbByFlask] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [bmrLoading, setBmrLoading] = useState(false);
  const [bmrUrl, setBmrUrl] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [pendingFlaskReject, setPendingFlaskReject] = useState(false);
  const [pendingFlaskAdvance, setPendingFlaskAdvance] = useState(null);
  const [flaskAdvanceReason, setFlaskAdvanceReason] = useState('');
  const [selectedFlaskId, setSelectedFlaskId] = useState(null);
  const [viewingStage, setViewingStage] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [flaskInoculations, setFlaskInoculations] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const stagePanelRef = useRef(null);

  // The Stage Timeline nav sits below the stage panel on mobile (panel first,
  // since it's the primary actionable content). Tapping a past stage there
  // otherwise updates the panel out of view above the user's scroll position —
  // bring it back into view instead of leaving them looking at a stale spot.
  useEffect(() => {
    if (viewingStage) {
      stagePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [viewingStage]);

  const { data: detailsData, error: detailsError, mutate: mutateDetails } = useSWR(
    batchId ? `/api/batches/${batchId}/details` : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network error');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load batch');
      return json;
    },
    { revalidateOnFocus: false, dedupingInterval: 2000 }
  );

  useEffect(() => {
    if (detailsData) {
      setLoadError(false);
      setBatch(detailsData.batch);
      setFlasks(detailsData.flasks);
      setTransitions(detailsData.transitions);
      setEmployees(detailsData.employees);
      setAvailableStock(detailsData.availableStock);
      const lnbEntries = detailsData.lnbEntries || [];
      setLnbCount(lnbEntries.length);
      setLnbEntryId(lnbEntries[0]?.id || null);
      const byFlask = {};
      lnbEntries.forEach(e => { if (e.flask_id) byFlask[e.flask_id] = (byFlask[e.flask_id] || 0) + 1; });
      setLnbByFlask(byFlask);
      setFlaskEndpoints(detailsData.flaskEndpoints);
      if (detailsData.batch?.bmr_url) setBmrUrl(detailsData.batch.bmr_url);
    }
  }, [detailsData]);

  useEffect(() => {
    if (detailsError) setLoadError(true);
  }, [detailsError]);

  const fetchAll = useCallback(() => {
    mutateDetails();
  }, [mutateDetails]);

  useEffect(() => {
    if (flasks.length > 0 && !selectedFlaskId) {
      const preselected = preselectFlaskId && flasks.some(f => f.id === preselectFlaskId) ? preselectFlaskId : null;
      setSelectedFlaskId(preselected || flasks[0].id);
    }
  }, [flasks, selectedFlaskId, preselectFlaskId]);

  // Fetch inoculation data for overtime detection when batch is fermenting
  useEffect(() => {
    if (!batch || !batchId) return;
    const fermentingFlasks = flasks.filter(f => f.current_stage === 'fermentation' && f.status !== 'rejected');
    if (fermentingFlasks.length === 0) {
      setFlaskInoculations([]);
      return;
    }
    supabase
      .from('batch_flask_inoculations')
      .select('flask_id, t_zero_time, planned_fermentation_hrs')
      .eq('batch_id', batchId)
      .then(({ data }) => {
        setFlaskInoculations(data || []);
      });
  }, [flasks, batch, batchId, supabase]);

  // Compute overtime flasks from inoculation data
  const overtimeFlasksComputed = useMemo(() => {
    if (!flaskInoculations.length) return [];
    const now = Date.now();
    const overtime = [];
    for (const inoc of flaskInoculations) {
      if (!inoc.t_zero_time || !inoc.planned_fermentation_hrs) continue;
      const hoursElapsed = (now - new Date(inoc.t_zero_time)) / 3600000;
      if (hoursElapsed > inoc.planned_fermentation_hrs) {
        const flask = flasks.find(f => f.id === inoc.flask_id);
        if (flask && flask.status !== 'rejected' && flask.current_stage === 'fermentation') {
          overtime.push({ ...flask, label: flask.flask_label, hoursElapsed, plannedHrs: inoc.planned_fermentation_hrs });
        }
      }
    }
    return overtime;
  }, [flaskInoculations, flasks]);

  const tickTaskChecklist = useCallback(async (completedStage) => {
    const keyword = stageChecklistMap[completedStage];
    if (!keyword) return;
    const { data: task } = await supabase.from('tasks').select('id, checklist').eq('batch_id', batchId).maybeSingle();
    if (!task?.checklist?.length) return;
    const updated = task.checklist.map(item =>
      item.text?.toLowerCase().includes(keyword.toLowerCase()) ? { ...item, done: true } : item
    );
    await supabase.from('tasks').update({ checklist: updated }).eq('id', task.id).catch(() => {});
  }, [supabase, batchId, stageChecklistMap]);

  const handleFlaskTransition = useCallback((flaskId, toStage, warnings = []) => {
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    const flask = flasks.find(f => f.id === flaskId);
    setFlaskAdvanceReason('');
    setPendingFlaskAdvance({ flaskId, flaskLabel: flask?.flask_label || flaskId, toStage, fromStage: flask?.current_stage, warnings });
  }, [flasks, lnbCount, toast]);

  const confirmFlaskAdvance = useCallback(async () => {
    if (!pendingFlaskAdvance) return;
    setGlobalError(null);
    const { flaskId, toStage, fromStage, warnings = [] } = pendingFlaskAdvance;
    if (warnings.length > 0 && !flaskAdvanceReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await withTimeout(
        fetch(`/api/batches/${batchId}/flask-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flask_id: flaskId, from_stage: fromStage, to_stage: toStage, override_reason: flaskAdvanceReason.trim() || null }),
        }),
        15000,
        'Server took too long to respond. Please try again.'
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Trial stage transition failed.');
      }

      setPendingFlaskAdvance(null);
      setFlaskAdvanceReason('');
      toast.success(`Trial advanced to ${toStage.replace(/_/g, ' ')}.`);
      setViewingStage(null);
      setEditingStage(null);
      tickTaskChecklist(fromStage).catch(() => {});
      fetchAll();
    } catch (err) {
      setGlobalError(err.message);
      toast.error(err.message);
    }
    finally { setActionLoading(false); }
  }, [pendingFlaskAdvance, flaskAdvanceReason, batchId, toast, fetchAll, tickTaskChecklist]);

  const handleDirectTransition = useCallback(async (toStage) => {
    if (actionLoading) return;
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/stage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_stage: batch?.current_stage, to_stage: toStage }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Stage transition failed.'); return; }
      toast.success(`Advanced to ${toStage.replace(/_/g, ' ')}.`);
      tickTaskChecklist(batch?.current_stage).catch(() => {});
      // Notify CEO/CTO when batch reaches QC Hold
      if (toStage === 'qc_hold') {
        const ceoCtoCandidates = employees.filter(e => ['ceo', 'cto', 'admin'].includes(e.role));
        const notifRows = ceoCtoCandidates.map(e => ({
          employee_id: e.id,
          title: `QC Hold — ${batch.batch_id} ready for review`,
          message: `Batch ${batch.batch_id} has reached QC Hold stage. Review results and make a release decision.`,
          link: `${listHref}/${batchId}`,
        }));
        if (notifRows.length > 0) {
          supabase.from('notifications').insert(notifRows).then(() => {}).catch(() => {});
        }
      }
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setActionLoading(false); }
  }, [actionLoading, lnbCount, batchId, batch, toast, fetchAll, tickTaskChecklist, employees, listHref, supabase]);

  const handleExportBMR = useCallback(async () => {
    if (bmrLoading) return;
    setBmrLoading(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/bmr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBmrUrl(data.signed_url);
      toast.success('BMR generated and saved to Document Vault.');
      if (data.signed_url) window.open(data.signed_url, '_blank');
    } catch (err) { toast.error('BMR generation failed: ' + err.message); }
    finally { setBmrLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, bmrLoading]);

  const handleStartBatch = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start batch');
      toast.success('Batch started at Media Prep.');
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, batchId, fetchAll, toast]);

  const handleCancelBatch = useCallback(async () => {
    setArchiveReason('');
    setPendingCancel(true);
  }, []);

  const confirmCancelBatch = useCallback(async () => {
    if (!archiveReason.trim()) {
      toast.error('Please provide a reason for archiving.');
      return;
    }
    setPendingCancel(false);
    try {
      const res = await fetch(`/api/batches?id=${batchId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive_reason: archiveReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || 'Batch archived.');
      router.push(listHref);
    } catch (err) {
      toast.error('Failed to archive batch: ' + err.message);
    }
  }, [archiveReason, batchId, toast, router, listHref]);

  // The two formulas that genuinely differ between the modules: whether
  // flasks are tracked individually yet (upstream gates this on the batch
  // having passed sterilisation; downstream flasks are always tracked
  // individually — they were handed off from Harvest) and whether the
  // batch can still be in a not-yet-started "scheduled" state (only
  // meaningful upstream).
  const isScheduled = module === 'upstream'
    ? ['planned', 'scheduled'].includes(batch?.status) && !batch?.current_stage
    : false;
  const isPostSterilisation = module === 'upstream'
    ? !isScheduled && ['inoculation', 'fermentation', 'harvest', 'straining', 'qc_hold', 'released', 'rejected'].includes(batch?.current_stage)
    : true;
  const isTerminal = ['released', 'rejected'].includes(batch?.status);

  const derivedStatus = (() => {
    if (!batch) return null;
    if (isTerminal) return batch.status;
    if (isScheduled) return 'scheduled';
    if (!isPostSterilisation || flasks.length === 0) return batch.status;
    const allRejected = flasks.every(f => f.status === 'rejected');
    if (allRejected) return 'rejected';
    const activeFlasks = flasks.filter(f => f.status !== 'rejected');
    const slowestStage = activeFlasks.reduce((slowest, f) => {
      const fStage = visibleWorkflowStage(f.current_stage);
      return stageRank(fStage) < stageRank(slowest) ? fStage : slowest;
    }, 'released');
    if (slowestStage === 'fermentation') return 'fermenting';
    if (slowestStage === 'qc_hold') return 'qc-hold';
    if (slowestStage === 'released') return 'released';
    if (['harvest', 'straining'].includes(slowestStage)) return 'processing';
    return batch.status;
  })();

  const selectedFlask = batch && isPostSterilisation && flasks.length > 0
    ? flasks.find(f => f.id === selectedFlaskId) || flasks[0]
    : null;
  const normalizedBatchStage = batch ? normalizeStage(batch.current_stage) : null;
  const activeStage = !batch || isScheduled ? null : visibleWorkflowStage(
    isPostSterilisation ? (normalizeStage(selectedFlask?.current_stage) || 'inoculation') : normalizedBatchStage
  );
  const displayStage = viewingStage || activeStage;
  const fermentingFlasks = flasks.filter(f => f.current_stage === 'fermentation' && f.status === 'active');

  return {
    // context
    role, employeeProfile, canDo, authLoading, router, toast, supabase, stagePanelRef,
    // data
    batch, flasks, transitions, employees, availableStock, flaskEndpoints,
    lnbCount, lnbEntryId, lnbByFlask, loadError,
    // derived
    overtimeFlasksComputed, isScheduled, isPostSterilisation, isTerminal,
    derivedStatus, selectedFlask, normalizedBatchStage, activeStage, displayStage, fermentingFlasks,
    // ui state
    actionLoading, bmrLoading, bmrUrl,
    pendingCancel, setPendingCancel, archiveReason, setArchiveReason,
    pendingFlaskReject, setPendingFlaskReject,
    pendingFlaskAdvance, setPendingFlaskAdvance, flaskAdvanceReason, setFlaskAdvanceReason,
    selectedFlaskId, setSelectedFlaskId, viewingStage, setViewingStage, editingStage, setEditingStage,
    globalError, setGlobalError,
    // handlers
    fetchAll, tickTaskChecklist, handleFlaskTransition, confirmFlaskAdvance, handleDirectTransition,
    handleExportBMR, handleStartBatch, handleCancelBatch, confirmCancelBatch,
  };
}
