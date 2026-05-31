'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import { Clock, CheckCircle2, XCircle, Plus, Lock, FlaskConical, Trash2, Microscope, ArrowDownToLine } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';
import ConfirmModal from '@/components/ui/ConfirmModal';

const DEFAULT_TESTS = [
  { test_name: 'pH — Final product',               target_spec: '4.2–4.6',                   result_unit: 'pH units' },
  { test_name: 'CFU count (Viable count)',          target_spec: '≥10⁶ CFU/ml',               result_unit: 'CFU/ml' },
  { test_name: 'Gram stain',                        target_spec: 'Gram-positive rods dominant', result_unit: '' },
  { test_name: 'Sensory — Aroma',                   target_spec: 'Tangy, clean, no off-odour', result_unit: '' },
  { test_name: 'Sensory — Colour',                  target_spec: 'Consistent with SKU target', result_unit: '' },
  { test_name: 'Sensory — Taste',                   target_spec: 'Acceptable per panel',       result_unit: '' },
  { test_name: 'Sensory — Overall',                 target_spec: 'PASS ≥7/10',                result_unit: 'score' },
  { test_name: 'Microbial (Yeast + Mould)',          target_spec: 'Defer to Phase 1',          result_unit: 'CFU/ml' },
];

const DEFAULT_TEST_ORDER = new Map(DEFAULT_TESTS.map((test, index) => [test.test_name, index]));

function buildStandardTestRows(sampleId, flaskId, existingTests = []) {
  const existingNames = new Set(existingTests.map(test => test.test_name));
  return DEFAULT_TESTS
    .filter(test => !existingNames.has(test.test_name))
    .map(test => ({
      sample_id: sampleId,
      flask_id: flaskId,
      test_name: test.test_name,
      target_spec: test.target_spec,
      result_unit: test.result_unit,
      pass_fail: test.pass_fail || 'Pending',
    }));
}

function dedupeQcTests(rows = []) {
  const byName = new Map();

  for (const row of rows) {
    const current = byName.get(row.test_name);
    if (!current || scoreQcRow(row) > scoreQcRow(current)) {
      byName.set(row.test_name, row);
    }
  }

  return Array.from(byName.values()).sort((a, b) => {
    const aOrder = DEFAULT_TEST_ORDER.has(a.test_name) ? DEFAULT_TEST_ORDER.get(a.test_name) : Number.MAX_SAFE_INTEGER;
    const bOrder = DEFAULT_TEST_ORDER.has(b.test_name) ? DEFAULT_TEST_ORDER.get(b.test_name) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.test_name.localeCompare(b.test_name);
  });
}

function scoreQcRow(row) {
  let score = 0;
  if (row.result_value) score += 4;
  if (row.tested_at) score += 3;
  if (row.pass_fail && row.pass_fail !== 'Pending') score += 2;
  if (row.updated_at) score += 1;
  return score;
}

export default function QCHoldPanel({ batch, activeFlask, employees, employeeProfile, role, canDo, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast    = useToast();
  const [sample,     setSample]     = useState(null);
  const [tests,      setTests]      = useState([]);
  const [incubations, setIncubations] = useState([]);
  const [creating,   setCreating]   = useState(false);
  const [creatingIncubation, setCreatingIncubation] = useState(false);
  const [deletingIncubationId, setDeletingIncubationId] = useState(null);
  const [confirmDeleteIncubationId, setConfirmDeleteIncubationId] = useState(null);
  const [pullingResults,       setPullingResults]       = useState(false);
  const [mediaFormulations,    setMediaFormulations]    = useState([]);
  const [regenerating,         setRegenerating]         = useState(false);
  const isCeo = ['ceo','admin'].includes(role);
  const autoPulledRef = useRef(false);

  // Plating config state
  const [platingEnabled,      setPlatingEnabled]      = useState(false);
  const [plateMedia,          setPlateMedia]          = useState('');
  const [plateDilution,       setPlateDilution]       = useState('');
  const [plateCount,          setPlateCount]          = useState('2');
  const [plateTemp,           setPlateTemp]           = useState('37');
  const [plateExpectedHours,  setPlateExpectedHours]  = useState('48');

  // External lab result fields
  const [resultReceivedDate, setResultReceivedDate] = useState('');
  const [coaUrl,             setCoaUrl]             = useState('');
  const [savingExtResult,    setSavingExtResult]     = useState(false);

  // Sample creation form
  const [samplingDate, setSamplingDate] = useState(new Date().toISOString().slice(0,10));
  const [volPerFlask,  setVolPerFlask]  = useState('');
  const [testingLoc,   setTestingLoc]   = useState('In-house');
  const [extLab,       setExtLab]       = useState('');
  const [extRef,       setExtRef]       = useState('');
  const [sentDate,     setSentDate]     = useState('');
  const [expectDate,   setExpectDate]   = useState('');

  const fetchQcData = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    const { data: sData } = await supabase.from('batch_flask_qc_samples').select('*').eq('flask_id', activeFlask.id).single();
    if (!isCurrent) return;
    if (sData) {
      setSample(sData);
      setResultReceivedDate(sData.result_received_date || '');
      setCoaUrl(sData.coa_url || '');
      if (sData.plating_enabled) {
        setPlatingEnabled(true);
        const cfg = sData.plating_config || {};
        if (cfg.media_type)       setPlateMedia(cfg.media_type);
        if (cfg.dilution)         setPlateDilution(cfg.dilution);
        if (cfg.plate_count)      setPlateCount(String(cfg.plate_count));
        if (cfg.incubation_temp_c) setPlateTemp(String(cfg.incubation_temp_c));
        if (cfg.expected_hours)   setPlateExpectedHours(String(cfg.expected_hours));
      }
      const [tRes, incRes] = await Promise.all([
        supabase.from('batch_flask_qc_tests').select('*').eq('sample_id', sData.id).order('test_name'),
        fetch(`/api/research/incubation?qc_sample_id=${sData.id}`).then(r => r.json()),
      ]);
      if (!isCurrent) return;

      let fetchedTests = tRes.data || [];

      // Auto-heal missing tests if the sample exists but tests were not generated
      if (fetchedTests.length === 0) {
        const testRows = buildStandardTestRows(sData.id, activeFlask.id, fetchedTests);
        const iRes = await supabase.from('batch_flask_qc_tests').insert(testRows).select();
        if (iRes.error) {
          console.error("Auto-heal QC insert error:", iRes.error);
          toast.error("QC Tests failed to generate: " + iRes.error.message);
        } else if (iRes.data && iRes.data.length > 0) {
          fetchedTests = iRes.data;
        }
      }

      setTests(dedupeQcTests(fetchedTests));
      setIncubations(incRes.success ? incRes.data || [] : []);
    } else {
      setSample(null); setTests([]); setIncubations([]);
    }
    return () => { isCurrent = false; };
  }, [activeFlask?.id, supabase, toast]);

  useEffect(() => {
    setSample(null); setTests([]); setIncubations([]);
    autoPulledRef.current = false;
    fetchQcData();
  }, [fetchQcData]);

  useEffect(() => {
    // Fetch Lab Media formulations for the dropdown
    supabase.from('formulations')
      .select('name')
      .eq('category', 'Lab Media')
      .eq('status', 'Approved')
      .order('name')
      .then(({data}) => setMediaFormulations(data || []));
  }, [supabase]);

  // Auto-pull incubation results when they become available and no tests have been filled yet
  useEffect(() => {
    if (autoPulledRef.current) return;
    if (!sample || !activeFlask) return;
    const hasCompleted = incubations.some(r => r.end_time);
    const allPending = tests.length > 0 && tests.every(t => t.pass_fail === 'Pending');
    if (!hasCompleted || !allPending) return;

    autoPulledRef.current = true;

    const completed = incubations.filter(r => r.end_time).sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
    const rec = completed[0];
    const updates = [];

    if (rec.cfu_per_ml != null || rec.colony_count != null) {
      const cfuTest = tests.find(t => t.test_name.toLowerCase().includes('cfu'));
      if (cfuTest) {
        const val = rec.cfu_per_ml != null ? String(rec.cfu_per_ml) : `${rec.colony_count} colonies`;
        updates.push(supabase.from('batch_flask_qc_tests').update({ result_value: val }).eq('id', cfuTest.id));
      }
    }

    if (rec.microscopic_morphology || rec.colony_morphology) {
      const gramTest = tests.find(t => t.test_name.toLowerCase().includes('gram'));
      if (gramTest) {
        const val = [rec.microscopic_morphology, rec.colony_morphology].filter(Boolean).join(' · ');
        updates.push(supabase.from('batch_flask_qc_tests').update({ result_value: val }).eq('id', gramTest.id));
      }
    }

    if (rec.sterility_status && rec.sterility_status !== 'Pending') {
      const micTest = tests.find(t => t.test_name.toLowerCase().includes('microbial') || t.test_name.toLowerCase().includes('yeast'));
      if (micTest) {
        const pf = rec.sterility_status === 'Sterile' ? 'Pass' : 'Fail';
        updates.push(supabase.from('batch_flask_qc_tests').update({ result_value: rec.sterility_status, pass_fail: pf }).eq('id', micTest.id));
      }
    }

    if (!updates.length) return;

    Promise.all(updates).then(() => {
      syncStageToLNB(supabase, batch.id, 'plating', {
        sterility_status: rec.sterility_status,
        colony_count: rec.colony_count,
        cfu_per_ml: rec.cfu_per_ml,
        colony_morphology: rec.colony_morphology,
        microscopic_morphology: rec.microscopic_morphology,
        observation: rec.observation,
        completed_at: rec.end_time,
      }, activeFlask.flask_label);
      fetchQcData();
      toast.success(`${updates.length} QC test(s) updated from plating results.`);
    }).catch(() => {
      // silent — avoid double error if manual pull also fails
    });
  }, [incubations, tests]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSample = async () => {
    if (!activeFlask) return;
    setCreating(true);
    try {
      // Generate sequential QC Sample ID: OB-QCS-YY-NNN-FN
      // Format: OB-QCS-26-001-F1 (flask label embedded at end)
      const yy = String(new Date().getFullYear()).slice(-2);
      const qcsPrefix = `OB-QCS-${yy}-`;
      const { data: lastQcs } = await supabase
        .from('batch_flask_qc_samples')
        .select('sample_id')
        .like('sample_id', `${qcsPrefix}%`)
        .order('sample_id', { ascending: false })
        .limit(1)
        .maybeSingle();
      let qcsSeq = 1;
      if (lastQcs?.sample_id) {
        // ID format: OB-QCS-26-001-F1 → split gives ['OB','QCS','26','001','F1']
        // Sequential number is always at index 3
        const parts = lastQcs.sample_id.split('-');
        const n = parseInt(parts[3], 10);
        if (!isNaN(n)) qcsSeq = n + 1;
      }
      const flaskLabel = activeFlask.flask_label || 'F?';
      const sampleId = `${qcsPrefix}${String(qcsSeq).padStart(3, '0')}-${flaskLabel}`;
      const { data: sRow, error: sErr } = await supabase.from('batch_flask_qc_samples').insert({
        flask_id: activeFlask.id, batch_id: batch.id, sample_id: sampleId,
        sampling_date: samplingDate, sampling_operator: employeeProfile?.id,
        volume_ml: volPerFlask ? parseFloat(volPerFlask) : null,
        testing_location: testingLoc,
        external_lab: testingLoc === 'NABL external lab' ? extLab : null,
        ext_ref_number: testingLoc === 'NABL external lab' ? extRef : null,
        sample_sent_date: sentDate || null, expected_date: expectDate || null,
      }).select().single();
      if (sErr) throw sErr;
      
      const testRows = buildStandardTestRows(sRow.id, activeFlask.id);
      const { error: testErr } = await supabase.from('batch_flask_qc_tests').insert(testRows);
      if (testErr) {
        console.error('Test creation error:', testErr);
        toast.error('Sample created, but failed to create standard tests: ' + testErr.message);
      } else {
        toast.success('Sample & tests created successfully');
      }

      // Pre-fill pH test from the last fermentation reading for this flask
      const { data: lastReading } = await supabase
        .from('batch_fermentation_readings')
        .select('ph')
        .eq('flask_id', activeFlask.id)
        .not('ph', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastReading?.ph) {
        await supabase.from('batch_flask_qc_tests')
          .update({ result_value: String(lastReading.ph) })
          .eq('sample_id', sRow.id)
          .ilike('test_name', '%ph%');
      }

      toast.success(`QC sample ${sampleId} created for ${activeFlask.flask_label}.`);
      fetchQcData();
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const handleUpdateTest = async (testId, field, value) => {
    const updatedTests = tests.map(t => t.id === testId ? { ...t, [field]: value } : t);
    setTests(updatedTests);
    await supabase.from('batch_flask_qc_tests').update({ [field]: value }).eq('id', testId);

    // Sync full QC state to LNB after every test update
    if (sample && activeFlask) {
      syncStageToLNB(supabase, batch.id, 'qc', {
        sample_id: sample.sample_id,
        tests: updatedTests.map(t => ({
          test: t.test_name,
          result: t.result_value || null,
          pass_fail: t.pass_fail,
        })),
      }, activeFlask.flask_label);
    }

    if (field === 'pass_fail' && value === 'Fail') {
      const failedTest = tests.find(t => t.id === testId);
      toast.warn(
        `⚠ QC FAIL: "${failedTest?.test_name || 'Test'}". Consider raising a CAPA in the Compliance module before releasing.`,
        { duration: 6000 }
      );
    }
  };

  const handleUpdatePlatingConfig = async (field, value) => {
    if (!sample) return;
    
    // Update local state
    if (field === 'media_type') setPlateMedia(value);
    if (field === 'dilution') setPlateDilution(value);
    if (field === 'plate_count') setPlateCount(value);
    if (field === 'incubation_temp_c') setPlateTemp(value);
    if (field === 'expected_hours') setPlateExpectedHours(value);

    // Save to DB
    let parsedVal = value || null;
    if (field === 'plate_count' && value) parsedVal = parseInt(value, 10);
    if (field === 'incubation_temp_c' && value) parsedVal = parseFloat(value);
    if (field === 'expected_hours' && value) parsedVal = parseInt(value, 10);

    const cfg = {
      ...(sample.plating_config || {}),
      [field]: parsedVal
    };

    setSample(prev => ({ ...prev, plating_config: cfg }));
    await supabase.from('batch_flask_qc_samples').update({ plating_config: cfg }).eq('id', sample.id);
  };

  const handleTogglePlating = async () => {
    if (!sample) return;
    const next = !platingEnabled;
    setPlatingEnabled(next);
    await supabase.from('batch_flask_qc_samples').update({ plating_enabled: next }).eq('id', sample.id);
  };

  const handleStartPlating = async () => {
    if (!sample || !activeFlask) return;
    setCreatingIncubation(true);
    try {
      const now = new Date();
      const config = {
        media_type: plateMedia || null,
        dilution: plateDilution || null,
        plate_count: plateCount ? parseInt(plateCount) : null,
        incubation_temp_c: plateTemp ? parseFloat(plateTemp) : 37,
        expected_hours: plateExpectedHours ? parseInt(plateExpectedHours) : null,
      };
      await supabase.from('batch_flask_qc_samples').update({
        plating_enabled: true,
        plating_config: config,
      }).eq('id', sample.id);

      const res = await fetch('/api/research/incubation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_name: `Plate — ${activeFlask.flask_label} (${sample.sample_id})`,
          batch_id: batch.id,
          flask_id: activeFlask.id,
          qc_sample_id: sample.id,
          source_stage: 'qc_hold',
          source_type: 'Batch QC Hold',
          sampled_at: sample.sampling_date ? new Date(sample.sampling_date).toISOString() : now.toISOString(),
          sample_category: 'Fermentation IPC',
          sample_type: 'Agar Plate',
          incubation_date: now.toISOString().slice(0, 10),
          incubation_temp_c: config.incubation_temp_c,
          start_time: now.toISOString(),
          sterility_status: 'Pending',
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create incubation record');
      toast.success('Plating started — incubation record created. Enter results in Research → Incubation when ready.');
      fetchQcData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingIncubation(false);
    }
  };

  const handleRegenerateTests = async () => {
    if (!sample) return;
    setRegenerating(true);
    try {
      const testRows = buildStandardTestRows(sample.id, activeFlask.id, tests);
      if (testRows.length === 0) {
        toast.info('All standard tests already exist.');
        return;
      }
      const { error } = await supabase.from('batch_flask_qc_tests').insert(testRows);
      if (error) throw error;

      // Pre-fill pH from last fermentation reading
      const { data: lastReading } = await supabase
        .from('batch_fermentation_readings')
        .select('ph')
        .eq('flask_id', activeFlask.id)
        .not('ph', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastReading?.ph) {
        await supabase.from('batch_flask_qc_tests')
          .update({ result_value: String(lastReading.ph) })
          .eq('sample_id', sample.id)
          .ilike('test_name', '%ph%');
      }

      toast.success('Standard tests regenerated successfully.');
      fetchQcData();
    } catch (err) { toast.error(err.message); }
    finally { setRegenerating(false); }
  };

  const handlePullPlatingResults = async () => {
    if (!sample || !activeFlask) return;
    const completed = incubations.filter(r => r.end_time).sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
    if (!completed.length) { toast.warn('No completed incubation records yet — enter results in Research → Incubation first.'); return; }
    const rec = completed[0];
    setPullingResults(true);
    try {
      // If tests don't exist yet, generate them first then re-fetch before mapping
      let currentTests = tests;
      if (currentTests.length === 0) {
        const testRows = buildStandardTestRows(sample.id, activeFlask.id, currentTests);
        if (testRows.length > 0) {
          await supabase.from('batch_flask_qc_tests').insert(testRows);
        }
        const { data: fresh } = await supabase.from('batch_flask_qc_tests').select('*').eq('sample_id', sample.id).order('test_name');
        currentTests = dedupeQcTests(fresh || []);
      }

      const updates = [];

      if (rec.cfu_per_ml != null || rec.colony_count != null) {
        const cfuTest = currentTests.find(t => t.test_name.toLowerCase().includes('cfu'));
        if (cfuTest) {
          const val = rec.cfu_per_ml != null ? String(rec.cfu_per_ml) : `${rec.colony_count} colonies`;
          updates.push(supabase.from('batch_flask_qc_tests').update({ result_value: val }).eq('id', cfuTest.id));
        }
      }

      if (rec.microscopic_morphology || rec.colony_morphology) {
        const gramTest = currentTests.find(t => t.test_name.toLowerCase().includes('gram'));
        if (gramTest) {
          const val = [rec.microscopic_morphology, rec.colony_morphology].filter(Boolean).join(' · ');
          updates.push(supabase.from('batch_flask_qc_tests').update({ result_value: val }).eq('id', gramTest.id));
        }
      }

      if (rec.sterility_status && rec.sterility_status !== 'Pending') {
        const micTest = currentTests.find(t => t.test_name.toLowerCase().includes('microbial') || t.test_name.toLowerCase().includes('yeast'));
        if (micTest) {
          const pf = rec.sterility_status === 'Sterile' ? 'Pass' : 'Fail';
          updates.push(supabase.from('batch_flask_qc_tests').update({ result_value: rec.sterility_status, pass_fail: pf }).eq('id', micTest.id));
        }
      }

      if (!updates.length) { toast.warn('No mappable results in the incubation record yet (colony count, morphology, or sterility).'); setPullingResults(false); fetchQcData(); return; }
      await Promise.all(updates);

      syncStageToLNB(supabase, batch.id, 'plating', {
        sterility_status: rec.sterility_status,
        colony_count: rec.colony_count,
        cfu_per_ml: rec.cfu_per_ml,
        colony_morphology: rec.colony_morphology,
        microscopic_morphology: rec.microscopic_morphology,
        observation: rec.observation,
        completed_at: rec.end_time,
      }, activeFlask.flask_label);

      fetchQcData();
      toast.success(`${updates.length} QC test(s) updated from plating results.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPullingResults(false);
    }
  };

  const handleDeleteIncubation = async (id) => {
    setDeletingIncubationId(id);
    try {
      const res = await fetch(`/api/research/incubation?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
      toast.success('Incubation record deleted.');
      fetchQcData();
    } catch (err) { toast.error(err.message); }
    finally {
      setDeletingIncubationId(null);
      setConfirmDeleteIncubationId(null);
    }
  };

  const handleSaveExtResult = async () => {
    if (!sample) return;
    setSavingExtResult(true);
    try {
      const { error } = await supabase.from('batch_flask_qc_samples').update({
        result_received_date: resultReceivedDate || null,
        coa_url: coaUrl || null,
      }).eq('id', sample.id);
      if (error) throw error;
      toast.success('External lab result details saved.');
    } catch (err) { toast.error(err.message); }
    finally { setSavingExtResult(false); }
  };

  const allDone     = tests.length > 0 && tests.every(t => t.pass_fail !== 'Pending');
  const anyFail     = tests.some(t => t.pass_fail === 'Fail');
  const passCount   = tests.filter(t => t.pass_fail === 'Pass').length;
  const failCount   = tests.filter(t => t.pass_fail === 'Fail').length;
  const pendingCount= tests.filter(t => t.pass_fail === 'Pending').length;

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view QC records.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3 border-l-4 border-l-rose-500">
        <Clock className="w-5 h-5 text-rose-600"/>
        <div><h2 className="text-base font-bold text-gray-900">QC Hold: <span className="text-rose-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-gray-500">All standard tests must be recorded before this trial can be released or rejected.</p></div>
      </div>

      {!sample ? (
        <div className="surface p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-900">Create QC Sample Record for {activeFlask.flask_label}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Sampling Date</label><input type="date" value={samplingDate} onChange={e=>setSamplingDate(e.target.value)} className="field-input"/></div>
            <div><label className="field-label">Sample Volume (ml)</label><input type="number" step="0.1" value={volPerFlask} onChange={e=>setVolPerFlask(e.target.value)} className="field-input" placeholder="10"/></div>
          </div>
          <div>
            <label className="field-label">Testing Location</label>
            <div className="flex gap-2">
              {['In-house','NABL external lab'].map(o=>(
                <button key={o} type="button" onClick={()=>setTestingLoc(o)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${testingLoc===o?'bg-rose-600 text-white border-rose-600':'bg-white text-gray-600 border-gray-200 hover:border-rose-300'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          {testingLoc === 'NABL external lab' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="field-label">External Lab Name</label><input value={extLab} onChange={e=>setExtLab(e.target.value)} className="field-input" placeholder="Lab name..."/></div>
              <div><label className="field-label">Ref Number</label><input value={extRef} onChange={e=>setExtRef(e.target.value)} className="field-input" placeholder="REF-001"/></div>
              <div><label className="field-label">Date Sent</label><input type="date" value={sentDate} onChange={e=>setSentDate(e.target.value)} className="field-input"/></div>
              <div><label className="field-label">Expected Date</label><input type="date" value={expectDate} onChange={e=>setExpectDate(e.target.value)} className="field-input"/></div>
            </div>
          )}
          <button onClick={handleCreateSample} disabled={creating} className="w-full py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
            <Plus className="w-3.5 h-3.5 inline mr-1"/>{creating ? 'Creating...' : 'Create Sample + Add Standard Tests'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="surface p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Sample ID</p>
              <p className="text-base font-black font-mono text-gray-900 mt-0.5">{sample.sample_id}</p>
              <p className="text-xs text-gray-400">{sample.testing_location} · Sampled: {sample.sampling_date}</p>
            </div>
            <div className="flex gap-2 text-center">
              <div className="px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-lg font-black text-emerald-700">{passCount}</p>
                <p className="text-[9px] font-bold text-emerald-600 uppercase">Pass</p>
              </div>
              <div className="px-3 py-2 bg-red-50 rounded-xl border border-red-100">
                <p className="text-lg font-black text-red-700">{failCount}</p>
                <p className="text-[9px] font-bold text-red-600 uppercase">Fail</p>
              </div>
              <div className="px-3 py-2 bg-gray-100 rounded-xl border border-gray-200">
                <p className="text-lg font-black text-gray-600">{pendingCount}</p>
                <p className="text-[9px] font-bold text-gray-500 uppercase">Pending</p>
              </div>
            </div>
          </div>

          {/* Plating & Incubation section */}
          <div className="surface p-4 border border-teal-100 bg-teal-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-black text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Microscope className="w-3.5 h-3.5"/> Plating & Incubation
                </p>
                <p className="text-xs text-teal-700 mt-0.5">Enable to log plate details, start incubation, and pull results back into QC tests.</p>
              </div>
              <button
                type="button"
                onClick={handleTogglePlating}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${platingEnabled ? 'bg-teal-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${platingEnabled ? 'translate-x-4' : ''}`}/>
              </button>
            </div>

            {platingEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 p-3 bg-white rounded-xl border border-teal-100">
                  <div>
                    <label className="field-label">Media Type (Recipe)</label>
                    <select value={plateMedia} onChange={e=>handleUpdatePlatingConfig('media_type', e.target.value)} className="field-input text-xs bg-white">
                      <option value="">Select Recipe...</option>
                      {mediaFormulations.map(f => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Dilution Factor</label>
                    <select value={plateDilution} onChange={e=>handleUpdatePlatingConfig('dilution', e.target.value)} className="field-input text-xs bg-white">
                      <option value="">Select...</option>
                      <option value="Direct (No dilution)">Direct (No dilution)</option>
                      <option value="10⁻¹">10⁻¹</option>
                      <option value="10⁻²">10⁻²</option>
                      <option value="10⁻³">10⁻³</option>
                      <option value="10⁻⁴">10⁻⁴</option>
                      <option value="10⁻⁵">10⁻⁵</option>
                      <option value="10⁻⁶">10⁻⁶</option>
                      <option value="10⁻⁷">10⁻⁷</option>
                      <option value="10⁻⁸">10⁻⁸</option>
                      <option value="10⁻⁹">10⁻⁹</option>
                      <option value="10⁻¹⁰">10⁻¹⁰</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">No. of Plates</label>
                    <input type="number" min="1" value={plateCount} onChange={e=>handleUpdatePlatingConfig('plate_count', e.target.value)} className="field-input text-xs" placeholder="2"/>
                  </div>
                  <div>
                    <label className="field-label">Incubation Temp (°C)</label>
                    <input type="number" step="0.1" value={plateTemp} onChange={e=>handleUpdatePlatingConfig('incubation_temp_c', e.target.value)} className="field-input text-xs" placeholder="37"/>
                  </div>
                  <div>
                    <label className="field-label">Expected Duration (hrs)</label>
                    <input type="number" value={plateExpectedHours} onChange={e=>handleUpdatePlatingConfig('expected_hours', e.target.value)} className="field-input text-xs" placeholder="48"/>
                  </div>
                </div>

                {incubations.length === 0 ? (
                  <button
                    onClick={handleStartPlating}
                    disabled={creatingIncubation}
                    className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    <FlaskConical className="w-3.5 h-3.5"/>
                    {creatingIncubation ? 'Starting...' : 'Start Plating'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    {incubations.map(record => {
                      const done = !!record.end_time;
                      const sterile = record.sterility_status === 'Sterile';
                      const contaminated = record.sterility_status === 'Contaminated';
                      return (
                        <div key={record.id} className="flex items-center justify-between gap-3 rounded-lg border border-teal-100 bg-white px-3 py-2">
                          <div>
                            <p className="text-xs font-black text-gray-800">{record.sample_name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${done ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                                {done ? `${Number(record.duration_hours||0).toFixed(1)}h done` : 'Ongoing'}
                              </span>
                              {done && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${sterile ? 'bg-emerald-50 text-emerald-700' : contaminated ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {record.sterility_status}
                                </span>
                              )}
                              {record.colony_count != null && (
                                <span className="text-[9px] text-gray-500">{record.colony_count} colonies</span>
                              )}
                              {record.cfu_per_ml != null && (
                                <span className="text-[9px] font-bold text-navy">{record.cfu_per_ml} CFU/ml</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <a href="/research/incubation" className="text-[10px] font-black uppercase tracking-wider text-teal-700 hover:underline">Enter Results</a>
                            {isCeo && (
                              <button onClick={()=>setConfirmDeleteIncubationId(record.id)} disabled={deletingIncubationId===record.id}
                                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40">
                                <Trash2 className="w-3.5 h-3.5"/>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {incubations.some(r => r.end_time) && (
                      <button
                        onClick={handlePullPlatingResults}
                        disabled={pullingResults}
                        className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5"/>
                        {pullingResults ? 'Pulling...' : 'Pull Results → QC Tests'}
                      </button>
                    )}

                    {!incubations.some(r => r.end_time) && (
                      <p className="text-xs text-teal-600 font-semibold text-center py-1">
                        Plate incubating — enter results in Research → Incubation when ready.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* External lab result entry */}
          {sample?.testing_location === 'NABL external lab' && (
            <div className="surface p-4 border border-amber-100 bg-amber-50/20">
              <p className="text-xs font-black text-amber-900 uppercase tracking-wider mb-3">
                External Lab Results — {sample.external_lab || 'NABL Lab'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="field-label">Date Results Received</label>
                  <input type="date" value={resultReceivedDate} onChange={e=>setResultReceivedDate(e.target.value)} className="field-input"/>
                </div>
                <div>
                  <label className="field-label">COA / Report URL</label>
                  <input value={coaUrl} onChange={e=>setCoaUrl(e.target.value)} className="field-input" placeholder="https://..."/>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleSaveExtResult} disabled={savingExtResult}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black uppercase tracking-wider disabled:opacity-60">
                  {savingExtResult ? 'Saving...' : 'Save'}
                </button>
                {coaUrl && (
                  <a href={coaUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-black text-amber-700 hover:underline">
                    Open COA ↗
                  </a>
                )}
                {sample.ext_ref_number && (
                  <span className="text-[10px] text-amber-700 font-bold">Ref: {sample.ext_ref_number}</span>
                )}
                {sample.expected_date && !resultReceivedDate && (
                  <span className="text-[10px] text-amber-600">Expected: {sample.expected_date}</span>
                )}
              </div>
            </div>
          )}

          {sample && tests.length === 0 && (
            <div className="surface p-5 flex flex-col items-center gap-3 border border-amber-200 bg-amber-50/40 text-center">
              <span className="text-3xl">⚠️</span>
              <div>
                <p className="text-sm font-black text-amber-900">Standard tests are missing</p>
                <p className="text-xs text-amber-700 mt-1">The sample was created, but standard QC tests failed to generate. You need to regenerate them to proceed.</p>
              </div>
              <button
                onClick={handleRegenerateTests}
                disabled={regenerating}
                className="px-5 py-2.5 bg-navy hover:bg-navy-hover text-white font-black rounded-xl text-xs uppercase tracking-wider disabled:opacity-60"
              >
                {regenerating ? 'Regenerating...' : 'Regenerate Standard Tests'}
              </button>
            </div>
          )}

          {tests.length > 0 && (
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead><tr className="bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-[9px] font-bold text-gray-400 uppercase w-48">Test</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold text-gray-400 uppercase">Target Spec</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold text-gray-400 uppercase w-28">Result</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold text-gray-400 uppercase w-16">Unit</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-center text-[9px] font-bold text-gray-400 uppercase w-32">Pass/Fail</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {tests.map(t => (
                    <tr key={t.id} className={t.pass_fail==='Fail'?'bg-red-50':t.pass_fail==='Pass'?'bg-emerald-50/50':'hover:bg-gray-50/30'}>
                      <td className="px-4 py-3 text-xs font-bold text-gray-800">{t.test_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.target_spec}</td>
                      <td className="px-4 py-3">
                        <input value={t.result_value||''} onChange={e=>handleUpdateTest(t.id,'result_value',e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-navy" placeholder="—"/>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{t.result_unit||'—'}</td>
                      <td className="px-4 py-3">
                        <input type="date" value={t.tested_at||''} onChange={e=>handleUpdateTest(t.id,'tested_at',e.target.value)}
                          className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:border-navy"/>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {['Pass','Fail','N/A'].map(o=>(
                            <button key={o} onClick={()=>handleUpdateTest(t.id,'pass_fail',o)}
                              className={`flex-1 py-1 text-[9px] font-black rounded border transition-all ${t.pass_fail===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':o==='Fail'?'bg-red-600 text-white border-red-600':'bg-gray-500 text-white border-gray-500'):'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                              {o}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {!allDone && (
            <div className="surface p-4 bg-gray-50 flex items-center gap-2 text-xs text-gray-500">
              <Lock className="w-4 h-4 text-gray-400"/>
              <span className="font-semibold">{pendingCount} test(s) still pending — all tests must be recorded before trial can be released or rejected.</span>
            </div>
          )}
          {allDone && (
            <div className="surface p-5 space-y-3">
              {anyFail && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800">
                  <XCircle className="w-4 h-4 text-red-600"/>{failCount} test(s) FAILED — trial should be rejected unless deviation approved.
                </div>
              )}
              {!anyFail && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600"/>All tests passed — trial eligible for release.
                </div>
              )}
              {!isCeo && <p className="text-xs text-gray-400 text-center font-semibold">Release / Reject authority is restricted to the CEO.</p>}
              {isCeo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button onClick={()=>onAdvanceFlaskStage('released')} disabled={actionLoading}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50">
                    ✓ Release Trial
                  </button>
                  <button onClick={()=>onAdvanceFlaskStage('rejected')} disabled={actionLoading}
                    className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50">
                    ✗ Reject Trial
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <ConfirmModal 
        isOpen={!!confirmDeleteIncubationId}
        onClose={() => setConfirmDeleteIncubationId(null)}
        onConfirm={() => handleDeleteIncubation(confirmDeleteIncubationId)}
        title="Delete Incubation Record"
        message="Are you sure you want to delete this incubation record? This cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
