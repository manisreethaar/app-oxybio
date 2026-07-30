'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Activity, Plus, Loader2, Wifi, WifiOff, Thermometer, Droplets, Wind } from 'lucide-react';

const SENSOR_TYPES = ['pH','Temperature','DO%','CO2_kPa','Pressure','OD','Brix','Flow_rate'];
const SENSOR_ICONS = { pH: Activity, Temperature: Thermometer, 'DO%': Droplets, CO2_kPa: Wind };

export default function ScadaDashboardPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = ['admin','ceo','cto'].includes(employeeProfile?.role);

  const [streams,    setStreams]    = useState([]);
  const [equipment,  setEquipment]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Manual ingestion form
  const [equipId,     setEquipId]     = useState('');
  const [sensorType,  setSensorType]  = useState('pH');
  const [sensorValue, setSensorValue] = useState('');
  const [unit,        setUnit]        = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // No try/catch/finally here before meant any error — or a stalled
      // connection — left this page spinning forever with no way out
      // except a manual refresh.
      const [sRes, eqRes] = await withTimeout(Promise.all([
        fetch('/api/scada').then(r => r.json()),
        supabase.from('equipment').select('id, name, model, status').order('name'),
      ]), 20000, 'SCADA load timed out');
      if (sRes.success) setStreams(sRes.data || []);
      if (eqRes.data) setEquipment(eqRes.data);
    } catch (err) {
      console.error('SCADA fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30s for live sensor data
  useEffect(() => {
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleManualLog = async (e) => {
    e.preventDefault();
    if (!equipId || !sensorValue) {
      const missing = [];
      if (!equipId) missing.push('Equipment ID');
      if (!sensorValue) missing.push('Sensor Value');
      toast.warn(`Cannot log SCADA reading. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/scada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: equipId, sensor_type: sensorType, sensor_value: parseFloat(sensorValue), unit: unit || null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Sensor reading logged.');
      setSensorValue(''); setShowManual(false);
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  // Group by sensor type for dashboard
  const byType = SENSOR_TYPES.reduce((acc, t) => {
    acc[t] = streams.filter(s => s.sensor_type === t).slice(0, 1);
    return acc;
  }, {});

  // Latest reading per equipment
  const byEquip = {};
  streams.forEach(s => {
    if (!byEquip[s.equipment_id]) byEquip[s.equipment_id] = [];
    if (byEquip[s.equipment_id].length < 3) byEquip[s.equipment_id].push(s);
  });

  if (authLoading || loading) return (
    <div className="page-container flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>
  );

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">SCADA / Sensor Streams</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time sensor data ingestion · POST endpoint: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs">/api/scada</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${streams.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {streams.length > 0 ? <Wifi className="w-3.5 h-3.5"/> : <WifiOff className="w-3.5 h-3.5"/>}
            {streams.length > 0 ? `${streams.length} streams` : 'No data'}
          </div>
          <button onClick={() => setShowManual(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover shadow-sm">
            <Plus className="w-4 h-4"/>Manual Log
          </button>
        </div>
      </div>

      {/* API Integration instructions */}
      <div className="card p-5 bg-slate-50 space-y-2">
        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Device Integration</p>
        <p className="text-xs text-slate-600 font-semibold">Send POST requests to <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">/api/scada</code> with header <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">Authorization: Bearer {'{CRON_SECRET}'}</code></p>
        <pre className="bg-white p-3 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 overflow-x-auto">{`// Example: pH controller POST
{
  "equipment_id": "<uuid from Equipment module>",
  "batch_id": "<optional batch uuid>",
  "sensor_type": "pH",
  "sensor_value": 4.35,
  "unit": "pH",
  "timestamp": "2026-06-04T10:30:00Z"
}`}</pre>
      </div>

      {/* Manual ingestion form */}
      {showManual && (
        <div className="card p-5 border-l-4 border-l-slate-500 space-y-4">
          <h3 className="text-sm font-black text-slate-900">Log Manual Sensor Reading</h3>
          <form onSubmit={handleManualLog} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="field-label">Equipment *</label>
              <select value={equipId} onChange={e=>setEquipId(e.target.value)} className="field-input bg-white" required>
                <option value="">Select...</option>
                {equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div><label className="field-label">Sensor Type</label>
              <select value={sensorType} onChange={e=>setSensorType(e.target.value)} className="field-input bg-white">
                {SENSOR_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="field-label">Value *</label>
              <input type="number" step="any" value={sensorValue} onChange={e=>setSensorValue(e.target.value)} className="field-input" placeholder="e.g. 4.35" required/>
            </div>
            <div><label className="field-label">Unit</label>
              <input value={unit} onChange={e=>setUnit(e.target.value)} className="field-input" placeholder="e.g. pH, °C, %"/>
            </div>
            <div className="col-span-2 sm:col-span-4 flex gap-3">
              <button type="submit" disabled={saving} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg text-xs uppercase disabled:opacity-50">{saving?'Logging...':'Log Reading'}</button>
              <button type="button" onClick={()=>setShowManual(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Live dashboard — latest per sensor type */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SENSOR_TYPES.map(type => {
          const latest = byType[type]?.[0];
          const Icon = SENSOR_ICONS[type] || Activity;
          const age = latest ? Math.round((Date.now() - new Date(latest.timestamp).getTime()) / 60000) : null;
          return (
            <div key={type} className={`card p-4 ${latest ? 'border-l-4 border-l-slate-500' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${latest ? 'text-slate-600' : 'text-slate-300'}`}/>
                <span className="text-xs font-black uppercase text-slate-500">{type}</span>
              </div>
              {latest ? (
                <>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{latest.sensor_value}<span className="text-sm font-semibold text-slate-400 ml-1">{latest.unit}</span></p>
                  <p className="text-xs text-slate-400 mt-1">{latest.equipment?.name || 'Unknown'} · {age === 0 ? 'Just now' : `${age}m ago`}</p>
                </>
              ) : (
                <p className="text-sm text-slate-300 font-bold">No data</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Stream log */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Recent Sensor Readings</h3>
          <button onClick={fetchAll} className="text-xs text-slate-500 hover:text-navy font-bold">Refresh</button>
        </div>
        {streams.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-20"/>
            <p className="font-semibold">No sensor data yet.</p>
            <p className="text-xs mt-1">Connect instruments to the POST endpoint or log manually above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-xs">
              <thead><tr className="bg-slate-50">
                <th className="px-4 py-2 text-left font-black text-slate-400 uppercase text-xs">Timestamp</th>
                <th className="px-4 py-2 text-left font-black text-slate-400 uppercase text-xs">Equipment</th>
                <th className="px-4 py-2 text-left font-black text-slate-400 uppercase text-xs">Sensor</th>
                <th className="px-4 py-2 text-right font-black text-slate-400 uppercase text-xs">Value</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {streams.slice(0, 100).map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap font-mono">{new Date(s.timestamp).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
                    <td className="px-4 py-2 font-semibold text-slate-700">{s.equipment?.name || '—'}</td>
                    <td className="px-4 py-2"><span className="px-2 py-0.5 bg-slate-50 text-slate-700 rounded text-xs font-black">{s.sensor_type}</span></td>
                    <td className="px-4 py-2 text-right font-black text-slate-900 tabular-nums">{s.sensor_value} <span className="text-slate-400 font-semibold">{s.unit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
