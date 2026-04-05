'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Clock, CheckCircle2, XCircle, Plus, Lock } from 'lucide-react';

const DEFAULT_TESTS = [
  { test_name: 'pH — Final product',               target_spec: '4.2–4.6',                   result_unit: 'pH units' },
  { test_name: 'CFU count (Viable count)',          target_spec: '≥10⁶ CFU/ml',               result_unit: 'CFU/ml' },
  { test_name: 'Gram stain',                        target_spec: 'Gram-positive rods dominant', result_unit: '' },
  { test_name: 'Sensory — Aroma',                   target_spec: 'Tangy, clean, no off-odour', result_unit: '' },
  { test_name: 'Sensory — Colour',                  target_spec: 'Consistent with SKU target', result_unit: '' },
  { test_name: 'Sensory — Taste',                   target_spec: 'Acceptable per panel',       result_unit: '' },
  { test_name: 'Sensory — Overall',                 target_spec: 'PASS ≥7/10',                result_unit: 'score' },
  { test_name: 'Microbial (Yeast + Mould)',          target_spec: 'Defer to Phase 1',          result_unit: 'CFU/ml', pass_fail: 'N/A' },
];

export default function QCHoldPanel({ batch, activeFlask, employees, employeeProfile, role, canDo, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast    = useToast();
  const [sample,     setSample]     = useState(null);
  const [tests,      setTests]      = useState([]);
  const [creating,   setCreating]   = useState(false);
  const isCeo = ['ceo','admin'].includes(role);

  // Sample creation form
  const [samplingDate, setSamplingDate] = useState(new Date().toISOString().slice(0,10));
  const [volPerFlask,  setVolPerFlask]  = useState('');
  const [testingLoc,   setTestingLoc]   = useState('In-house');
  const [extLab,       setExtLab]       = useState('');
  const [extRef,       setExtRef]       = useState('');
  const [sentDate,     setSentDate]     = useState('');
  const [expectDate,   setExpectDate]   = useState('');

  const fetch = useCallback(async () => {
    if (!activeFlask) return;
    const { data: sData } = await supabase.from('batch_flask_qc_samples').select('*').eq('flask_id', activeFlask.id).single();
    if (sData) {
      setSample(sData);
      const { data: tData } = await supabase.from('batch_flask_qc_tests').select('*').eq('sample_id', sData.id).order('created_at');
      setTests(tData || []);
    } else {
      setSample(null);
      setTests([]);
    }
  }, [activeFlask, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreateSample = async () => {
    if (!activeFlask) return;
    setCreating(true);
    try {
      const now = new Date();
      const sampleId = `QCS-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getTime().toString().slice(-4)}`;
      const { data: sRow, error: sErr } = await supabase.from('batch_flask_qc_samples').insert({
        flask_id: activeFlask.id, sample_id: sampleId,
        sampling_date: samplingDate, sampling_operator: employeeProfile?.id,
        volume_ml: volPerFlask ? parseFloat(volPerFlask) : null,
        testing_location: testingLoc,
        external_lab: testingLoc === 'NABL external lab' ? extLab : null,
        ext_ref_number: testingLoc === 'NABL external lab' ? extRef : null,
        sample_sent_date: sentDate || null, expected_date: expectDate || null,
      }).select().single();
      if (sErr) throw sErr;
      
      const testRows = DEFAULT_TESTS.map(t => ({
        sample_id: sRow.id, flask_id: activeFlask.id,
        test_name: t.test_name, target_spec: t.target_spec,
        result_unit: t.result_unit, pass_fail: t.pass_fail || 'Pending',
      }));
      await supabase.from('batch_flask_qc_tests').insert(testRows);
      toast.success(`QC sample ${sampleId} created for ${activeFlask.flask_label}.`);
      fetch();
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const handleUpdateTest = async (testId, field, value) => {
    setTests(prev => prev.map(t => t.id === testId ? { ...t, [field]: value } : t));
    await supabase.from('batch_flask_qc_tests').update({ [field]: value }).eq('id', testId);

    if (field === 'pass_fail' && value === 'Fail') {
      const failedTest = tests.find(t => t.id === testId);
      toast.warn(
        `⚠ QC FAIL: "${failedTest?.test_name || 'Test'}". Consider raising a CAPA in the Compliance module before releasing.`,
        { duration: 6000 }
      );
    }
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}
