'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import {
  FlaskConical, TrendingUp, AlertTriangle, CheckCircle2,
  Zap, Activity, RefreshCw, Info, Filter, BarChart2
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, ScatterController, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, ScatterController, Filler
);

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

// ── Bioprocess KPI Engine ────────────────────────────────────────────────────
// Calculates μ, Yx/s, Yp/s, Qp from time-series kinetic data
function calcKinetics(readings) {
  const sorted = [...readings].sort((a, b) => a.elapsed_hours - b.elapsed_hours);
  if (sorted.length < 2) return null;

  // Specific growth rate μ = ln(X2/X1) / (t2-t1) — use OD as biomass proxy
  const odPoints = sorted.filter(r => r.optical_density != null);
  let mu = null;
  if (odPoints.length >= 2) {
    const last = odPoints[odPoints.length - 1];
    const first = odPoints[0];
    const dt = last.elapsed_hours - first.elapsed_hours;
    if (dt > 0 && last.optical_density > 0 && first.optical_density > 0) {
      mu = Math.log(last.optical_density / first.optical_density) / dt;
    }
  }

  // Substrate consumption (Brix as proxy for sugar) — ΔS
  const brixPoints = sorted.filter(r => r.brix != null);
  let yxs = null, productionRate = null;
  if (brixPoints.length >= 2) {
    const deltaS = brixPoints[0].brix - brixPoints[brixPoints.length - 1].brix; // consumption
    if (deltaS > 0 && odPoints.length >= 2) {
      const deltaX = odPoints[odPoints.length - 1].optical_density - odPoints[0].optical_density;
      yxs = deltaX > 0 ? (deltaX / deltaS) : null;
    }
  }

  // TA production rate — ΔTA/Δt (lactic acid rate)
  const taPoints = sorted.filter(r => r.titratable_acidity_pct != null);
  let maxTaRate = null;
  const taRates = [];
  for (let i = 1; i < taPoints.length; i++) {
    const dta = parseFloat(taPoints[i].titratable_acidity_pct) - parseFloat(taPoints[i - 1].titratable_acidity_pct);
    const dt = taPoints[i].elapsed_hours - taPoints[i - 1].elapsed_hours;
    if (dt > 0) taRates.push(dta / dt);
  }
  if (taRates.length) maxTaRate = Math.max(...taRates);

  // Volumetric productivity Qp ≈ final TA% × 10 g/L / total hours
  const finalTA = taPoints.length ? parseFloat(taPoints[taPoints.length - 1].titratable_acidity_pct) : null;
  const totalHours = sorted[sorted.length - 1].elapsed_hours;
  const qp = finalTA && totalHours > 0 ? (finalTA * 10) / totalHours : null;

  // Anomaly detection flags
  const anomalies = [];
  if (mu !== null && mu < 0.01 && odPoints.length >= 3) {
    anomalies.push({ type: 'stalled_growth', msg: 'Growth rate (μ) near zero — premature stationary phase detected', severity: 'high' });
  }
  if (yxs !== null && yxs < 0.05) {
    anomalies.push({ type: 'low_yield', msg: 'Low biomass yield (Yx/s < 0.05) — possible metabolic shift or contamination', severity: 'high' });
  }
  if (maxTaRate !== null && maxTaRate < 0.005) {
    anomalies.push({ type: 'slow_acidification', msg: 'Slow acid production rate — check starter culture viability and inoculation %', severity: 'medium' });
  }

  return { mu, yxs, qp, maxTaRate, finalTA, anomalies };
}

// ── SVG Sparkline for TA progression per batch ───────────────────────────────
function TaProgressionChart({ batchReadings }) {
  const batchKeys = Object.keys(batchReadings);
  if (!batchKeys.length) return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No TA data with time-series readings</div>;

  const W = 500, H = 120, PAD = { t: 12, r: 16, b: 24, l: 40 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

  let allTA = [], allHours = [];
  batchKeys.forEach(k => batchReadings[k].forEach(r => {
    if (r.titratable_acidity_pct != null) allTA.push(parseFloat(r.titratable_acidity_pct));
    if (r.elapsed_hours != null) allHours.push(parseFloat(r.elapsed_hours));
  }));
  if (!allTA.length) return null;

  const minTA = Math.max(0, Math.min(...allTA) - 0.05);
  const maxTA = Math.max(...allTA) + 0.05;
  const maxH = Math.max(...allHours, 1);
  const xS = h => PAD.l + (h / maxH) * cW;
  const yS = v => PAD.t + cH - ((v - minTA) / (maxTA - minTA)) * cH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Target band */}
      <rect x={PAD.l} y={yS(1.0)} width={cW} height={Math.max(0, yS(0.6) - yS(1.0))} fill="#10b981" fillOpacity={0.07}/>
      <line x1={PAD.l} x2={W - PAD.r} y1={yS(0.6)} y2={yS(0.6)} stroke="#10b981" strokeWidth={0.8} strokeDasharray="3,2"/>
      <line x1={PAD.l} x2={W - PAD.r} y1={yS(1.0)} y2={yS(1.0)} stroke="#10b981" strokeWidth={0.8} strokeDasharray="3,2"/>
      {batchKeys.map((k, i) => {
        const pts = batchReadings[k].filter(r => r.titratable_acidity_pct != null && r.elapsed_hours != null)
          .sort((a, b) => a.elapsed_hours - b.elapsed_hours);
        if (pts.length < 2) return null;
        const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(parseFloat(p.titratable_acidity_pct)).toFixed(1)}`).join(' ');
        const col = COLORS[i % COLORS.length];
        return (
          <g key={k}>
            <path d={d} stroke={col} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {pts.map((p, j) => (
              <circle key={j} cx={xS(p.elapsed_hours)} cy={yS(parseFloat(p.titratable_acidity_pct))} r={3}
                fill={col} stroke="white" strokeWidth={1}/>
            ))}
          </g>
        );
      })}
      {[minTA, (minTA + maxTA) / 2, maxTA].map(v => (
        <text key={v} x={PAD.l - 4} y={yS(v)} textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#9ca3af">{v.toFixed(2)}</text>
      ))}
      {[0, Math.round(maxH / 2), Math.round(maxH)].map(h => (
        <text key={h} x={xS(h)} y={H - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">T+{h}h</text>
      ))}
      <text x={W - PAD.r} y={yS(0.8)} textAnchor="end" fontSize={8} fill="#10b981">Target 0.6–1.0%</text>
    </svg>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BioprocessAnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [batches, setBatches]   = useState([]);
  const [readings, setReadings] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [titrationLogs, setTitrationLogs] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [products, setProducts] = useState([]);
  const [dateRange, setDateRange] = useState('6M');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let fromDate = new Date();
        if (dateRange === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
        else if (dateRange === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
        else if (dateRange === '6M') fromDate.setMonth(fromDate.getMonth() - 6);
        else if (dateRange === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
        else fromDate = new Date(2000, 0, 1);

        let bq = supabase.from('batches').select('id, batch_id, product_name, status, created_at')
          .gte('created_at', fromDate.toISOString()).limit(1000);
        if (selectedProduct !== 'ALL') bq = bq.eq('product_name', selectedProduct);
        const { data: bData } = await withTimeout(bq, 20000, 'Batch query timed out');

        if (products.length === 0) {
          const { data: allB } = await supabase.from('batches').select('product_name').limit(1000);
          setProducts([...new Set((allB || []).map(b => b.product_name).filter(Boolean))]);
        }

        const batchIds = (bData || []).map(b => b.id);
        setBatches(bData || []);

        if (batchIds.length > 0) {
          const [rRes, eRes, tRes] = await withTimeout(Promise.all([
            supabase.from('batch_fermentation_readings')
              .select('batch_id, elapsed_hours, ph, brix, optical_density, titratable_acidity_pct, incubator_temp_c').limit(5000)
              .in('batch_id', batchIds),
            supabase.from('batch_flask_endpoints')
              .select('batch_id, flask_id, total_hours, final_ph, titratable_acidity_pct, sensory_overall').limit(5000)
              .in('batch_id', batchIds),
            supabase.from('titration_logs')
              .select('*').limit(5000)
              .in('source_id', batchIds)
              .eq('source_type', 'batch')
              .order('created_at', { ascending: false }),
          ]), 20000, 'Analytics load timed out');
          setReadings(rRes.data || []);
          setEndpoints(eRes.data || []);
          setTitrationLogs(tRes.data || []);
        } else {
          setReadings([]); setEndpoints([]); setTitrationLogs([]);
        }
      } catch (err) {
        toast.error('Failed to load bioprocess analytics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedProduct]);

  // Per-batch readings grouped
  const batchReadings = useMemo(() => {
    const map = {};
    batches.forEach(b => {
      map[b.batch_id] = readings.filter(r => r.batch_id === b.id);
    });
    return map;
  }, [batches, readings]);

  // Batch-level kinetics KPIs
  const batchKinetics = useMemo(() => {
    return batches.map(b => {
      const rds = readings.filter(r => r.batch_id === b.id);
      const kpi = calcKinetics(rds);
      const ep = endpoints.find(e => e.batch_id === b.id);
      return { batch: b, kpi, ep };
    }).filter(bk => bk.kpi !== null);
  }, [batches, readings, endpoints]);

  // Chart: μ (specific growth rate) per batch
  const muChartData = useMemo(() => ({
    labels: batchKinetics.map(bk => bk.batch.batch_id),
    datasets: [{
      label: 'Specific Growth Rate μ (/h)',
      data: batchKinetics.map(bk => bk.kpi?.mu != null ? +bk.kpi.mu.toFixed(4) : null),
      backgroundColor: batchKinetics.map(bk =>
        bk.kpi?.mu != null && bk.kpi.mu > 0.01 ? 'rgba(79,70,229,0.7)' : 'rgba(239,68,68,0.7)'
      ),
      borderColor: batchKinetics.map(bk =>
        bk.kpi?.mu != null && bk.kpi.mu > 0.01 ? '#4f46e5' : '#ef4444'
      ),
      borderWidth: 1,
      borderRadius: 6,
    }],
  }), [batchKinetics]);

  // Chart: Max TA Rate per batch
  const taRateChartData = useMemo(() => ({
    labels: batchKinetics.filter(bk => bk.kpi?.maxTaRate != null).map(bk => bk.batch.batch_id),
    datasets: [{
      label: 'Max TA Rate (%/h)',
      data: batchKinetics.filter(bk => bk.kpi?.maxTaRate != null).map(bk => +bk.kpi.maxTaRate.toFixed(5)),
      backgroundColor: 'rgba(16,185,129,0.7)',
      borderColor: '#10b981',
      borderWidth: 1,
      borderRadius: 6,
    }],
  }), [batchKinetics]);

  // Total anomalies
  const allAnomalies = useMemo(() => {
    return batchKinetics.flatMap(bk =>
      (bk.kpi?.anomalies || []).map(a => ({ ...a, batch_id: bk.batch.batch_id }))
    );
  }, [batchKinetics]);

  const barOpts = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true }, x: { ticks: { font: { size: 9 } } } },
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-end border border-slate-200/50">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Product</label>
          <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="ALL">All Products</option>
            {products.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Date Range</label>
          <select value={dateRange} onChange={e => setDateRange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500">
            {[['1M','Last 1 Month'],['3M','Last 3 Months'],['6M','Last 6 Months'],['1Y','Last 1 Year'],['ALL','All Time']].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {loading && <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mb-2"/>}
      </div>

      {!loading && (
        <>
          {/* ── Anomaly Alerts ──────────────────────────────────────────── */}
          {allAnomalies.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500"/> Process Flaw Detections ({allAnomalies.length})
              </h3>
              {allAnomalies.map((a, i) => (
                <div key={i} className={`rounded-xl p-3 border flex items-start gap-3 ${
                  a.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${a.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`}/>
                  <div>
                    <p className={`text-xs font-black ${a.severity === 'high' ? 'text-red-800' : 'text-amber-800'}`}>
                      Batch {a.batch_id}
                    </p>
                    <p className={`text-xs font-semibold ${a.severity === 'high' ? 'text-red-700' : 'text-amber-700'}`}>
                      {a.msg}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.type === 'stalled_growth' && '→ Rectify: Check dissolved oxygen, agitation speed, and potential inhibitory metabolites.'}
                      {a.type === 'low_yield' && '→ Rectify: Inspect substrate purity, check for contamination, review inoculation rate.'}
                      {a.type === 'slow_acidification' && '→ Rectify: Verify starter culture activity, confirm inoculation %, check incubation temperature.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {allAnomalies.length === 0 && batchKinetics.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0"/>
              <p className="text-xs font-bold text-emerald-800">All batches within normal kinetic parameters — no anomalies detected.</p>
            </div>
          )}

          {/* ── KPI Summary Cards ───────────────────────────────────────── */}
          {batchKinetics.length > 0 && (() => {
            const muVals = batchKinetics.map(bk => bk.kpi?.mu).filter(v => v != null);
            const yxsVals = batchKinetics.map(bk => bk.kpi?.yxs).filter(v => v != null);
            const qpVals = batchKinetics.map(bk => bk.kpi?.qp).filter(v => v != null);
            const taRateVals = batchKinetics.map(bk => bk.kpi?.maxTaRate).filter(v => v != null);
            const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
            const kpiCards = [
              { label: 'Avg μ (Growth Rate)', value: avg(muVals)?.toFixed(4), unit: '/h', icon: TrendingUp, color: 'indigo', desc: 'Specific growth rate — higher is faster growth' },
              { label: 'Avg Yx/s (Yield)', value: avg(yxsVals)?.toFixed(3), unit: 'g/g', icon: Zap, color: 'emerald', desc: 'Biomass per substrate consumed' },
              { label: 'Avg Qp (Productivity)', value: avg(qpVals)?.toFixed(3), unit: 'g/L/h', icon: Activity, color: 'blue', desc: 'Volumetric acid productivity' },
              { label: 'Avg Max ΔTA/Δt', value: avg(taRateVals)?.toFixed(5), unit: '%/h', icon: BarChart2, color: 'red', desc: 'Fastest acidification rate observed' },
            ];
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map(k => {
                  const Icon = k.icon;
                  const colorMap = { indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600', blue: 'bg-slate-50 text-slate-600', red: 'bg-red-50 text-red-600' };
                  return (
                    <div key={k.label} className="glass-card rounded-2xl p-5 border border-slate-200/50">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colorMap[k.color]}`}>
                        <Icon className="w-5 h-5"/>
                      </div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-0.5">{k.label}</p>
                      <p className="text-3xl font-black text-slate-800 tabular-nums">{k.value ?? '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{k.unit} · {k.desc}</p>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Charts ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* μ per batch */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500"/> Specific Growth Rate (μ) per Batch
              </h3>
              <p className="text-xs text-slate-400 mb-4">Red bars = stalled growth detected (&lt;0.01/h)</p>
              <div className="h-60">
                {batchKinetics.length ? <Bar data={muChartData} options={barOpts}/> : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Insufficient kinetic data (need OD readings)</div>
                )}
              </div>
            </div>

            {/* Max TA rate per batch */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-1 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500"/> Max Acidification Rate (ΔTA/Δt) per Batch
              </h3>
              <p className="text-xs text-slate-400 mb-4">Higher = faster lactic acid production</p>
              <div className="h-60">
                {taRateChartData.labels?.length ? <Bar data={taRateChartData} options={barOpts}/> : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">No TA time-series readings found</div>
                )}
              </div>
            </div>

            {/* TA Progression Overlay */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white lg:col-span-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-1 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-red-500"/> Acid Curve Overlay (TA% vs Time)
              </h3>
              <p className="text-xs text-slate-400 mb-4">Green band = target endpoint range (0.6–1.0% for lactic acid)</p>
              <TaProgressionChart batchReadings={batchReadings}/>
            </div>
          </div>

          {/* ── Standalone Titration Data ───────────────────────────────── */}
          {titrationLogs.length > 0 && (
            <div className="glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-slate-600"/>
                <h3 className="text-sm font-bold text-slate-900">Dedicated TA Lab Readings Linked to These Batches</h3>
                <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{titrationLogs.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] divide-y divide-gray-100">
                  <thead>
                    <tr className="bg-slate-50/50">
                      {['Sample', 'Batch', 'Acid Type', 'TA %', 'Status', 'T+ hr', 'Date'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {titrationLogs.map(log => {
                      const ACID = { 'Lactic Acid': { min: 0.6, max: 1.0 }, 'Citric Acid': { min: 0.4, max: 0.8 }, 'Acetic Acid': { min: 0.3, max: 0.7 } };
                      const c = ACID[log.acid_type] || ACID['Lactic Acid'];
                      const ta = parseFloat(log.ta_percent);
                      const inRange = ta >= c.min && ta <= c.max;
                      const b = batches.find(x => x.id === log.source_id);
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/30">
                          <td className="px-4 py-2 text-sm font-semibold text-slate-800">{log.sample_name}</td>
                          <td className="px-4 py-2 text-xs font-bold text-indigo-700">{b?.batch_id || log.source_label || '—'}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{log.acid_type}</td>
                          <td className="px-4 py-2 font-black text-base tabular-nums"
                            style={{ color: inRange ? '#047857' : '#dc2626' }}>{ta.toFixed(3)}%</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-black ${inRange ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                              {inRange ? '✓' : ta < c.min ? '↓ Low' : '↑ High'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500 tabular-nums">
                            {log.elapsed_hours != null ? `T+${parseFloat(log.elapsed_hours).toFixed(1)}h` : '—'}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-400">
                            {new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {batches.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30"/>
              <p className="font-semibold">No batch data found for the selected filters.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
