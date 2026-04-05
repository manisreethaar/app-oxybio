'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Activity, Plus, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const FLASK_COLORS = ['#1e3a5f', '#d97706', '#7c3aed', '#059669'];
const FOAM_OPTS = ['None','Slight','Moderate','Heavy'];
const APPEARANCE_OPTS = ['Normal','Colour change','Turbidity change','Separation observed'];

function PhChart({ readings }) {
  if (!readings.length) return (
    <div className="h-28 flex items-center justify-center text-xs text-gray-300 border border-dashed border-gray-200 rounded-xl">No readings yet — chart will appear here</div>
  );
  const valid = readings.filter(r => r.ph != null && r.elapsed_hours != null);
  if (!valid.length) return null;
  const W = 400, H = 140, PAD = { t: 12, r: 16, b: 24, l: 32 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const maxH = Math.max(...valid.map(r => r.elapsed_hours), 1);
  const allPh = valid.map(r => r.ph);
  const minPh = Math.max(3.0, Math.min(...allPh) - 0.3);
  const maxPh = Math.min(7.0, Math.max(...allPh) + 0.3);
  const xS = h  => PAD.l + (h / maxH) * cW;
  const yS = ph => PAD.t + cH - ((ph - minPh) / (maxPh - minPh)) * cH;
  const byFlask = {};
  valid.forEach(r => {
    const k = r.flask_label || 'All';
    (byFlask[k] = byFlask[k] || []).push(r);
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <rect x={PAD.l} y={yS(4.5)} width={cW} height={yS(4.2)-yS(4.5)} fill="#10b981" fillOpacity={0.07}/>
      <line x1={PAD.l} x2={W-PAD.r} y1={yS(4.2)} y2={yS(4.2)} stroke="#10b981" strokeWidth={0.5} strokeDasharray="2,2"/>
      <line x1={PAD.l} x2={W-PAD.r} y1={yS(4.5)} y2={yS(4.5)} stroke="#10b981" strokeWidth={0.5} strokeDasharray="2,2"/>
      {[3.5,4.0,4.5,5.0,5.5].map(ph => (
        <line key={ph} x1={PAD.l} x2={W-PAD.r} y1={yS(ph)} y2={yS(ph)} stroke="#f3f4f6" strokeWidth={0.8}/>
      ))}
      {Object.entries(byFlask).map(([label, pts], i) => {
        const sorted = [...pts].sort((a,b) => a.elapsed_hours - b.elapsed_hours);
        const d = sorted.map((p,j) => `${j===0?'M':'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(p.ph).toFixed(1)}`).join(' ');
        const col = FLASK_COLORS[i % FLASK_COLORS.length];
        return (
          <g key={label}>
            <path d={d} stroke={col} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {sorted.map((p,j) => (
              <circle key={j} cx={xS(p.elapsed_hours)} cy={yS(p.ph)} r={3}
                fill={p.is_ph_alarm?'#ef4444':col} stroke="white" strokeWidth={1.2}/>
            ))}
          </g>
        );
      })}
      {[3.5,4.0,4.5,5.0,5.5].filter(ph => ph>=minPh&&ph<=maxPh).map(ph => (
        <text key={ph} x={PAD.l-4} y={yS(ph)} textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#9ca3af">{ph.toFixed(1)}</text>
      ))}
      {[0, Math.round(maxH/2), Math.round(maxH)].map(h => (
        <text key={h} x={xS(h)} y={H-4} textAnchor="middle" fontSize={8} fill="#9ca3af">T+{h}h</text>
      ))}
      {Object.keys(byFlask).map((label, i) => (
        <g key={label} transform={`translate(${PAD.l + i*40}, ${PAD.t})`}>
          <rect x={0} y={0} width={10} height={3} fill={FLASK_COLORS[i%FLASK_COLORS.length]} rx={1}/>
          <text x={13} y={4} fontSize={8} fill="#6b7280">{label}</text>
        </g>
      ))}
      <text x={W-PAD.r} y={yS(4.35)} textAnchor="end" fontSize={7} fill="#10b981">Target 4.2–4.5</text>
    </svg>
  );
}

export default function FermentationPanel({ batch, flasks, activeFlask, employees, employeeProfile, role, canDo, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [readings,  setReadings]  = useState([]);
  const [inocu,     setInocu]     = useState(null);
  const [endpoint,  setEndpoint]  = useState(null);
  const [saving,    setSaving]    = useState(false);

  // Reading form
  const [pH,         setPH]         = useState('');
  const [temp,       setTemp]       = useState('');
  const [foam,       setFoam]       = useState('None');
  const [appearance, setAppearance] = useState('Normal');
  const [notes,      setNotes]      = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');
  const [isRetro,    setIsRetro]    = useState(false);
  const [retroReason, setRetroReason] = useState('');
  const [loggedAt,   setLoggedAt]   = useState('');

  // Endpoint form
  const [showEndpoint, setShowEndpoint] = useState(false);
  const [epPh,       setEpPh]       = useState('');
  const [aroma,      setAroma]      = useState('Tangy and clean');
  const [texture,    setTexture]    = useState('Normal slurry');
  const [sensory,    setSensory]    = useState('PASS');
  const [gramStain,  setGramStain]  = useState('Not done');
  const [colourDesc, setColourDesc] = useState('');
  const [epNotes,    setEpNotes]    = useState('');
  const [savingEp,   setSavingEp]   = useState(false);
  const [pendingOOROverride, setPendingOOROverride] = useState(false);

  const isIntern = ['intern','research_intern'].includes(role);

  const fetchData = useCallback(async () => {
    if (!activeFlask) return;
    const [rRes, iRes, epRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('*').eq('batch_id', batch.id).order('logged_at'),
      supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).single(),
      supabase.from('batch_flask_endpoints').select('*').eq('flask_id', activeFlask.id).single(),
    ]);
    if (rRes.data)  setReadings(rRes.data);
    if (iRes.data)  setInocu(iRes.data);
    if (epRes.data) setEndpoint(epRes.data);
  }, [batch.id, activeFlask, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Elapsed hours from T=0 specific to THIS flask
  const tZero     = inocu?.t_zero_time ? new Date(inocu.t_zero_time) : null;
  const elapsedHr = tZero ? ((new Date() - tZero) / 3600000) : null;
  const maxExceeded = elapsedHr != null && elapsedHr > (inocu?.planned_fermentation_hrs || 24);
  const latestAlarm = readings.filter(r => r.flask_id === activeFlask?.id).some(r => r.is_ph_alarm || r.is_temp_alarm);

  const handleLogReading = async (e) => {
    e.preventDefault();
    if (!pH || saving || !activeFlask) return;
    if (isIntern && !supervisedBy) { toast.warn('Select a supervisor before submitting.'); return; }
    const elapsed = tZero ? (new Date(isRetro && loggedAt ? loggedAt : new Date()) - tZero) / 3600000 : null;
    
    setSaving(true);
    try {
      const phVal = parseFloat(pH);
      const isAlarm = phVal < 3.8 || phVal > 5.5;
      
      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id, flask_id: activeFlask.id, flask_label: activeFlask.flask_label,
        ph: phVal, incubator_temp_c: temp ? parseFloat(temp) : null,
        foam_level: foam, visual_appearance: appearance,
        elapsed_hours: elapsed ? parseFloat(elapsed.toFixed(2)) : null,
        logged_at: isRetro && loggedAt ? loggedAt : new Date().toISOString(),
        is_ph_alarm: isAlarm,
        is_retrospective: isRetro, retro_reason: isRetro ? retroReason : null,
        supervised_by: supervisedBy || null, notes: notes || null,
        logged_by: employeeProfile?.id
      });
      if (error) throw error;
      toast.success('Reading logged.');
      setPH(''); setTemp(''); setNotes(''); setIsRetro(false); setRetroReason(''); setLoggedAt('');
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleEndpoint = async (e) => {
    e.preventDefault();
    if (!epPh || savingEp) return;
    const finalPh = parseFloat(epPh);
    const phOOR = finalPh < 4.2 || finalPh > 4.5;
    if (phOOR) {
      setPendingOOROverride(true);
      return;
    }
    await executeEndpoint();
  };

  const confirmOOROverride = async () => {
    setPendingOOROverride(false);
    await executeEndpoint();
  };

  const executeEndpoint = async () => {
    const finalPh = parseFloat(epPh);
    setSavingEp(true);
    try {
      const epData = {
        flask_id: activeFlask.id, batch_id: batch.id,
        total_hours: elapsedHr ? parseFloat(elapsedHr.toFixed(2)) : null,
        final_ph: finalPh, aroma, colour_desc: colourDesc,
        texture, sensory_overall: sensory, gram_stain: gramStain, 
        notes: epNotes, declared_by: employeeProfile?.id,
      };
      const { error: epErr } = await supabase.from('batch_flask_endpoints').upsert(epData, { onConflict: 'flask_id' });
      if (epErr) throw epErr;
      
      toast.success(`Endpoint declared for ${activeFlask.flask_label}.`);
      fetchData(); onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSavingEp(false); }
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Fermentation details.</div>;

  return (
    <div className="space-y-5">
      {/* Header + alarms */}
      <div className="surface p-5 border-l-4 border-l-navy">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-navy"/>
            <h2 className="text-base font-bold text-gray-900">Fermentation: <span className="text-navy">{activeFlask.flask_label}</span></h2>
            {tZero && <span className="px-2 py-0.5 bg-navy/5 border border-navy/20 rounded text-[10px] font-black text-navy">{elapsedHr?.toFixed(1)}hr Elapsed</span>}
          </div>
          {!endpoint && tZero && (
            <button onClick={() => setShowEndpoint(s => !s)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${showEndpoint ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-navy'}`}>
              {showEndpoint ? 'Cancel Endpoint' : 'Declare Endpoint'}
            </button>
          )}
        </div>
        {!tZero && <p className="text-xs text-red-500 font-bold mt-2">Error: T=0 has not been set for this trial!</p>}
        {endpoint && <div className="flex items-center gap-2 mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg"><CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-xs font-bold text-emerald-800">Endpoint declared — Final pH: {endpoint.final_ph} · {endpoint.total_hours?.toFixed(1)}hr total</span></div>}
        {latestAlarm && <div className="flex items-start gap-2 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/><span className="text-xs font-bold text-red-800">⚠ Active alarm — a recent reading for this flask is out of bounds.</span></div>}
        {maxExceeded && !endpoint && <div className="flex items-start gap-2 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"><Clock className="w-4 h-4 text-amber-600 shrink-0"/><span className="text-xs font-bold text-amber-800">Planned fermentation duration exceeded. Time to declare endpoint?</span></div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Reading Log Form ── */}
        {!endpoint && tZero && (
          <div className="surface overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Log Reading for {activeFlask.flask_label}</h3>
            </div>
            <form onSubmit={handleLogReading} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">pH Value <span className="text-red-500">★ CCP</span></label>
                <input type="number" step="0.01" min="0" max="14" required value={pH} onChange={e=>setPH(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-3xl font-black font-mono tracking-tighter text-gray-800 focus:border-navy outline-none text-center" placeholder="0.00"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Incubator Temp (°C)</label>
                  <input type="number" step="0.1" value={temp} onChange={e=>setTemp(e.target.value)} placeholder="37.0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Foam</label>
                  <select value={foam} onChange={e=>setFoam(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {FOAM_OPTS.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Visual Appearance</label>
                <select value={appearance} onChange={e=>setAppearance(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                  {APPEARANCE_OPTS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="retro" checked={isRetro} onChange={e=>setIsRetro(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
                <label htmlFor="retro" className="text-xs font-semibold text-gray-600">Retrospective entry</label>
              </div>
              {isRetro && (
                <div className="space-y-2 pl-6">
                  <input type="datetime-local" value={loggedAt} onChange={e=>setLoggedAt(e.target.value)} className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs font-semibold outline-none"/>
                  <input placeholder="Reason for retrospective entry (required)" value={retroReason} onChange={e=>setRetroReason(e.target.value)} className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs font-semibold outline-none"/>
                </div>
              )}
              {isIntern && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-red-500 mb-1">Supervised By <span className="text-red-500">*Required</span></label>
                  <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} required className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-red-400">
                    <option value="">Select supervising scientist...</option>
                    {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              )}
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none"/>
              <button type="submit" disabled={saving||!pH} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5"/>{saving ? 'Logging...' : 'Commit Reading'}
              </button>
            </form>
          </div>
        )}

        {/* ── Chart + Reading Table (Shows All Flasks' graph context) ── */}
        <div className="surface overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Trial Trends</h3>
          </div>
          <div className="p-4">
            <PhChart readings={readings}/>
          </div>
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="min-w-full divide-y divide-gray-100">
              <thead><tr className="bg-gray-50/50">
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Flask</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">T+hr</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">pH</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Temp</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...readings].filter(r => r.flask_id === activeFlask.id).reverse().map(r => (
                  <tr key={r.id} className={r.is_ph_alarm ? 'bg-red-50' : 'hover:bg-gray-50/30'}>
                    <td className="px-4 py-2 text-xs font-black text-navy">{r.flask_label}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-gray-600">T+{r.elapsed_hours?.toFixed(1)}h</td>
                    <td className={`px-4 py-2 text-sm font-black tabular-nums ${r.is_ph_alarm?'text-red-600':'text-gray-900'}`}>{r.ph}</td>
                    <td className={`px-4 py-2 text-xs font-semibold ${r.is_temp_alarm?'text-amber-600':'text-gray-600'}`}>{r.incubator_temp_c ? `${r.incubator_temp_c}°C` : '—'}</td>
                  </tr>
                ))}
                {readings.filter(r => r.flask_id === activeFlask.id).length===0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">No readings yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Endpoint Declaration ── */}
      {!endpoint && showEndpoint && (
        <div className="surface overflow-hidden border-2 border-navy/20">
          <div className="px-5 py-4 border-b border-gray-100 bg-navy/5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-navy"/>
            <h3 className="text-sm font-bold text-gray-900">Declare Endpoint for {activeFlask.flask_label}</h3>
          </div>
          <form onSubmit={handleEndpoint} className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Final pH</label>
                <input type="number" step="0.01" required value={epPh} onChange={e=>setEpPh(e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-2xl font-black font-mono text-center outline-none ${parseFloat(epPh)<4.2||parseFloat(epPh)>4.5?'border-red-400 text-red-600':'border-gray-200 text-gray-800 focus:border-navy'}`} placeholder="4.30"/>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Total Fermentation Time</label>
                <div className="px-4 py-3 border-2 border-gray-100 rounded-xl bg-gray-50 text-center">
                  <p className="text-2xl font-black text-gray-800">{elapsedHr?.toFixed(1)}<span className="text-sm text-gray-400"> hr</span></p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Aroma</label>
                <select value={aroma} onChange={e=>setAroma(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Tangy and clean','Mild','Off-odour detected'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Texture</label>
                <select value={texture} onChange={e=>setTexture(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Normal slurry','Over-separated','Clumped'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Colour Description</label>
                <input value={colourDesc} onChange={e=>setColourDesc(e.target.value)} placeholder="e.g. Reddish-purple" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none"/>
              </div>
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Gram Stain</label>
                <select value={gramStain} onChange={e=>setGramStain(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Gram-positive rods dominant','Mixed','Gram-negative dominant','Not done'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[{label:'Sensory Overall',val:sensory,set:setSensory,opts:['PASS','FAIL']}].map(f=>(
                <div key={f.label}><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">{f.label}</label>
                  <div className="flex gap-2">
                    {f.opts.map(o=><button type="button" key={o} onClick={()=>f.set(o)} className={`flex-1 py-2 text-xs font-black rounded-lg border transition-all ${f.val===o?(o==='PASS'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{o}</button>)}
                  </div>
                </div>
              ))}
            </div>
            <textarea value={epNotes} onChange={e=>setEpNotes(e.target.value)} rows={2} placeholder="Endpoint notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
            <div className="grid grid-cols-1 gap-3">
              <button type="submit" disabled={savingEp} className="py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
                {savingEp ? 'Saving...' : 'Save Endpoint Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Advance button (after endpoint declared) */}
      {endpoint && (
        <div className="surface p-5 flex items-center justify-between">
          <div className="text-sm">
            <p className="font-bold text-gray-900">Endpoint declared ✓</p>
            <p className="text-gray-500 text-xs">Final pH: {endpoint.final_ph} · {endpoint.total_hours?.toFixed(1)}hr total fermentation</p>
          </div>
          <button disabled={actionLoading} onClick={() => onAdvanceFlaskStage('straining')} className="px-5 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
            Advance Trial → Straining
          </button>
        </div>
      )}

      {/* Out of Range Override Modal */}
      {pendingOOROverride && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-amber-600 mb-2 text-center flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5"/> pH Alert
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Final pH <strong className="text-amber-600">{epPh}</strong> is outside the target range of 4.2–4.5. Confirm and proceed with endpoint declaration anyway?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingOOROverride(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmOOROverride}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition w-full"
              >
                ⚠ Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
