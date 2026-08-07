'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useToast } from '@/context/ToastContext';
import {
  Activity, Download, Filter, RefreshCw, Layers, ExternalLink,
  Thermometer, Clock, CheckCircle, XCircle, FlaskConical,
  TrendingUp, TrendingDown, BarChart2, List, Zap, Droplets, Wind
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend,
  ScatterController, BubbleController, BarController, DoughnutController, Filler
} from 'chart.js';
import { Line, Bubble, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend,
  ScatterController, BubbleController, BarController, DoughnutController, Filler
);

const COLORS = [
  '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'
];

const TABS = [
  { id:'overview', label:'Overview',        Icon:BarChart2  },
  { id:'growth',   label:'Growth Analysis', Icon:TrendingUp },
  { id:'trends',   label:'Process Trends',  Icon:Activity   },
  { id:'table',    label:'Data Table',      Icon:List       },
];

function StatCard({ icon: Icon, label, value, sub, color = 'text-indigo-600', bg = 'bg-indigo-50' }) {
  return (
    <div className="glass-card rounded-2xl p-4 border border-slate-200/50 bg-white flex items-start gap-3">
      <div className={bg + ' p-2.5 rounded-xl shrink-0'}>
        <Icon className={'w-4 h-4 ' + color} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-lg font-black text-slate-800 truncate leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, Icon, children, className }) {
  return (
    <div className={'glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden ' + (className || '')}>
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
          {title}
        </h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function EmptyChart({ msg }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
      <BarChart2 className="w-7 h-7" />
      <p className="text-xs font-medium text-slate-400">{msg || 'No data recorded yet.'}</p>
    </div>
  );
}

export default function BatchAnalyticsPage() {
  const [batches,   setBatches]   = useState([]);
  const [readings,  setReadings]  = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [products,  setProducts]  = useState([]);

  const supabase  = useMemo(() => createClient(), []);
  const toast     = useToast();
  const reportRef = useRef();

  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [dateRange,       setDateRange]       = useState('6M');
  const [focusBatchId,    setFocusBatchId]    = useState('ALL');
  const [activeTab,       setActiveTab]       = useState('overview');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        let from = new Date();
        if (dateRange === '1M') from.setMonth(from.getMonth() - 1);
        else if (dateRange === '3M') from.setMonth(from.getMonth() - 3);
        else if (dateRange === '6M') from.setMonth(from.getMonth() - 6);
        else if (dateRange === '1Y') from.setFullYear(from.getFullYear() - 1);
        else from = new Date(2000, 0, 1);

        let bq = supabase
          .from('batches')
          .select('id, batch_id, created_at, status, product_name')
          .gte('created_at', from.toISOString());
        if (selectedProduct !== 'ALL') bq = bq.eq('product_name', selectedProduct);

        const { data: bData, error: bErr } = await withTimeout(bq, 20000, 'Batch query timed out');
        if (bErr) throw bErr;

        const ids = bData.map(b => b.id);

        if (products.length === 0) {
          const { data: aB } = await withTimeout(supabase.from('batches').select('product_name'), 20000, 'Products timed out');
          setProducts([...new Set((aB || []).map(b => b.product_name).filter(Boolean))]);
        }

        if (ids.length > 0) {
          const [rRes, eRes] = await withTimeout(Promise.all([
            supabase.from('batch_fermentation_readings')
              .select('batch_id,elapsed_hours,ph,incubator_temp_c,optical_density,brix,titratable_acidity_pct,foam_level,plating_result,visual_appearance,notes,logged_at')
              .in('batch_id', ids)
              .order('elapsed_hours', { ascending: true }),
            supabase.from('batch_flask_endpoints')
              .select('batch_id,flask_id,total_hours,final_ph,sensory_overall,titratable_acidity_pct,aroma,colour_desc,texture,notes')
              .in('batch_id', ids)
          ]), 20000, 'Details timed out');
          if (rRes.data) setReadings(rRes.data);
          if (eRes.data) setEndpoints(eRes.data);
        } else {
          setReadings([]); setEndpoints([]);
        }

        setBatches(bData);
        setFocusBatchId(prev => (prev !== 'ALL' && !bData.find(b => b.id === prev) ? 'ALL' : prev));
      } catch (err) {
        toast.error('Failed to load analytics'); console.error(err);
      } finally {
        setLoading(false);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedProduct]);

  // ── OVERLAY chart memos ──────────────────────────────────────
  const phChartData = useMemo(() => {
    const datasets = [];
    const hMap = {}; const hCnt = {};
    batches.forEach(b => {
      readings.filter(r => r.batch_id === b.id && r.ph != null && r.elapsed_hours != null)
        .forEach(r => { const h = +r.elapsed_hours; hMap[h] = (hMap[h]||0) + +r.ph; hCnt[h] = (hCnt[h]||0)+1; });
    });
    const avg = Object.keys(hMap)
      .map(h => ({ x:+h, y:+((hMap[h]/hCnt[h]).toFixed(2)) }))
      .sort((a,b) => a.x - b.x);
    batches.forEach((b, idx) => {
      const pts = readings.filter(r => r.batch_id===b.id && r.ph!=null && r.elapsed_hours!=null)
        .sort((a,c) => a.elapsed_hours - c.elapsed_hours);
      if (!pts.length) return;
      const pc = pts.map(r => {
        const av = avg.find(a => a.x === +r.elapsed_hours)?.y;
        return av && Math.abs(+r.ph - av)/av > 0.15 ? '#ef4444' : COLORS[idx%COLORS.length];
      });
      datasets.push({ label:b.batch_id, data:pts.map(r=>({x:+r.elapsed_hours,y:+r.ph})),
        borderColor:COLORS[idx%COLORS.length], backgroundColor:pc, pointBackgroundColor:pc,
        pointRadius:3, borderWidth:2, fill:false, tension:0.2 });
    });
    if (avg.length) datasets.push({ label:'Hist. Avg', data:avg, borderColor:'#94a3b8',
      borderWidth:2.5, borderDash:[5,5], pointRadius:0, fill:false, tension:0.2 });
    return { datasets };
  }, [batches, readings]);

  const odOverlayData = useMemo(() => ({
    datasets: batches.reduce((acc,b,idx) => {
      const pts = readings.filter(r => r.batch_id===b.id && r.optical_density!=null && r.elapsed_hours!=null)
        .sort((a,c) => a.elapsed_hours - c.elapsed_hours);
      if (!pts.length) return acc;
      acc.push({ label:b.batch_id, data:pts.map(r=>({x:+r.elapsed_hours,y:+r.optical_density})),
        borderColor:COLORS[idx%COLORS.length], backgroundColor:COLORS[idx%COLORS.length]+'22',
        pointRadius:3, borderWidth:2, fill:false, tension:0.25 });
      return acc;
    }, [])
  }), [batches, readings]);

  const brixOverlayData = useMemo(() => ({
    datasets: batches.reduce((acc,b,idx) => {
      const pts = readings.filter(r => r.batch_id===b.id && r.brix!=null && r.elapsed_hours!=null)
        .sort((a,c) => a.elapsed_hours - c.elapsed_hours);
      if (!pts.length) return acc;
      acc.push({ label:b.batch_id, data:pts.map(r=>({x:+r.elapsed_hours,y:+r.brix})),
        borderColor:COLORS[idx%COLORS.length], backgroundColor:COLORS[idx%COLORS.length]+'22',
        pointRadius:3, borderWidth:2, fill:false, tension:0.25 });
      return acc;
    }, [])
  }), [batches, readings]);

  const endpointBubbleData = useMemo(() => {
    const pass=[]; const fail=[];
    endpoints.forEach(ep => {
      const b = batches.find(bx => bx.id === ep.batch_id);
      const lbl = b ? b.batch_id+' (flask)' : 'Unknown';
      const rd = readings.filter(r => r.batch_id===ep.batch_id && r.incubator_temp_c!=null);
      const avgT = rd.length ? rd.reduce((s,r)=>s + +r.incubator_temp_c,0)/rd.length : 35;
      if (ep.total_hours!=null && ep.final_ph!=null) {
        const pt = { x:+ep.total_hours, y:+ep.final_ph, r:Math.max(4,Math.min(25,(avgT-20)*0.8)), batch:lbl, temp:avgT.toFixed(1) };
        ep.sensory_overall==='FAIL' ? fail.push(pt) : pass.push(pt);
      }
    });
    return { datasets:[
      { label:'Passed Sensory', data:pass, backgroundColor:'rgba(16,185,129,0.6)', borderColor:'#10b981', borderWidth:1 },
      { label:'Failed Sensory', data:fail, backgroundColor:'rgba(239,68,68,0.6)',  borderColor:'#ef4444', borderWidth:1 }
    ]};
  }, [endpoints, batches, readings]);

  const sensoryDonutData = useMemo(() => {
    const p = endpoints.filter(e=>e.sensory_overall!=='FAIL').length;
    const f = endpoints.filter(e=>e.sensory_overall==='FAIL').length;
    return { labels:['PASS','FAIL'], datasets:[{ data:[p,f],
      backgroundColor:['rgba(16,185,129,0.8)','rgba(239,68,68,0.8)'],
      borderColor:['#10b981','#ef4444'], borderWidth:2 }] };
  }, [endpoints]);

  const crossBatchStats = useMemo(() => batches.map(b => {
    const bRd = readings.filter(r=>r.batch_id===b.id);
    const bEp = endpoints.filter(e=>e.batch_id===b.id);
    const ph  = bRd.filter(r=>r.ph!=null).map(r=>+r.ph);
    const od  = bRd.filter(r=>r.optical_density!=null).map(r=>+r.optical_density);
    const bx  = bRd.filter(r=>r.brix!=null).map(r=>+r.brix);
    const hrs = bRd.filter(r=>r.elapsed_hours!=null).map(r=>+r.elapsed_hours);
    const p   = bEp.filter(e=>e.sensory_overall!=='FAIL').length;
    return {
      id:b.id, batch_id:b.batch_id, product:b.product_name||'—',
      duration:  hrs.length ? Math.max(...hrs)+'h' : '—',
      avgPh:     ph.length  ? (ph.reduce((s,v)=>s+v,0)/ph.length).toFixed(2) : '—',
      peakOd:    od.length  ? Math.max(...od).toFixed(3) : '—',
      brixStart: bx.length  ? bx[0].toFixed(1) : '—',
      brixEnd:   bx.length  ? bx[bx.length-1].toFixed(1) : '—',
      finalPh:   bEp.length ? (bEp.reduce((s,e)=>s+Number(e.final_ph||0),0)/bEp.length).toFixed(2) : '—',
      sensory:   bEp.length ? p+'/'+bEp.length+' PASS' : '—',
    };
  }), [batches, readings, endpoints]);

  // ── SINGLE-BATCH memos ───────────────────────────────────────
  const focusBatch     = useMemo(() => batches.find(b=>b.id===focusBatchId)||null, [batches,focusBatchId]);
  const focusReadings  = useMemo(() =>
    readings.filter(r=>r.batch_id===focusBatchId).sort((a,b)=>a.elapsed_hours-b.elapsed_hours),
    [readings,focusBatchId]
  );
  const focusEndpoints = useMemo(() => endpoints.filter(e=>e.batch_id===focusBatchId), [endpoints,focusBatchId]);

  const mkDs = (data, col) => ({ data, borderColor:col, backgroundColor:col+'14',
    borderWidth:2.5, pointRadius:4, pointBackgroundColor:col, fill:true, tension:0.35 });

  const singlePhData   = useMemo(() => ({ datasets:[{ label:'pH',     ...mkDs(focusReadings.filter(r=>r.ph!=null).map(r=>({x:+r.elapsed_hours,y:+r.ph})), '#4f46e5') }] }), [focusReadings]);
  const singleTempData = useMemo(() => ({ datasets:[{ label:'Temp',   ...mkDs(focusReadings.filter(r=>r.incubator_temp_c!=null).map(r=>({x:+r.elapsed_hours,y:+r.incubator_temp_c})), '#f59e0b') }] }), [focusReadings]);
  const singleOdData   = useMemo(() => ({ datasets:[{ label:'OD600',  ...mkDs(focusReadings.filter(r=>r.optical_density!=null).map(r=>({x:+r.elapsed_hours,y:+r.optical_density})), '#10b981') }] }), [focusReadings]);
  const singleBrixData = useMemo(() => ({ datasets:[{ label:'Brix',   ...mkDs(focusReadings.filter(r=>r.brix!=null).map(r=>({x:+r.elapsed_hours,y:+r.brix})), '#8b5cf6') }] }), [focusReadings]);
  const singleTaData   = useMemo(() => ({ datasets:[{ label:'TA (%)', ...mkDs(focusReadings.filter(r=>r.titratable_acidity_pct!=null).map(r=>({x:+r.elapsed_hours,y:+r.titratable_acidity_pct})), '#ef4444') }] }), [focusReadings]);

  const phOdDualData = useMemo(() => ({
    datasets: [
      { label:'pH',    yAxisID:'y',  ...mkDs(focusReadings.filter(r=>r.ph!=null).map(r=>({x:+r.elapsed_hours,y:+r.ph})), '#4f46e5'), fill:false },
      { label:'OD600', yAxisID:'y1', ...mkDs(focusReadings.filter(r=>r.optical_density!=null).map(r=>({x:+r.elapsed_hours,y:+r.optical_density})), '#10b981'), fill:false, borderDash:[4,2] }
    ]
  }), [focusReadings]);

  const growthKinetics = useMemo(() => {
    const pts = focusReadings.filter(r=>r.optical_density!=null && +r.optical_density>0)
      .sort((a,b)=>a.elapsed_hours - b.elapsed_hours);
    const rates = [];
    for (let i=1; i<pts.length; i++) {
      const t1=+pts[i-1].elapsed_hours, t2=+pts[i].elapsed_hours;
      const o1=+pts[i-1].optical_density, o2=+pts[i].optical_density;
      const dt=t2-t1;
      if (dt>0 && o1>0 && o2>0) {
        const mu=(Math.log(o2)-Math.log(o1))/dt;
        rates.push({ tMid:+((t1+t2)/2).toFixed(1), mu:+mu.toFixed(4), td:mu>0?+(Math.LN2/mu).toFixed(2):null });
      }
    }
    const pos  = rates.filter(r=>r.mu>0);
    const peak = pos.length ? Math.max(...pos.map(r=>r.mu)) : null;
    return {
      rates,
      peakMu:      peak ? peak.toFixed(4) : '—',
      minDoubling: peak ? (Math.LN2/peak).toFixed(1) : '—',
      odStart:     pts.length ? (+pts[0].optical_density).toFixed(3) : '—',
      odEnd:       pts.length ? (+pts[pts.length-1].optical_density).toFixed(3) : '—',
      barData: {
        labels: rates.map(r=>r.tMid+'h'),
        datasets:[{ label:'Growth Rate (h-1)', data:rates.map(r=>r.mu),
          backgroundColor:rates.map(r=>r.mu>0?'rgba(16,185,129,0.75)':'rgba(239,68,68,0.6)'),
          borderColor:rates.map(r=>r.mu>0?'#10b981':'#ef4444'),
          borderWidth:1, borderRadius:4 }]
      }
    };
  }, [focusReadings]);

  const focusStats = useMemo(() => {
    if (!focusBatch) return null;
    const ph  = focusReadings.filter(r=>r.ph!=null).map(r=>+r.ph);
    const tmp = focusReadings.filter(r=>r.incubator_temp_c!=null).map(r=>+r.incubator_temp_c);
    const od  = focusReadings.filter(r=>r.optical_density!=null).map(r=>+r.optical_density);
    const bx  = focusReadings.filter(r=>r.brix!=null).map(r=>+r.brix);
    const hrs = focusReadings.filter(r=>r.elapsed_hours!=null).map(r=>+r.elapsed_hours);
    const p   = focusEndpoints.filter(e=>e.sensory_overall!=='FAIL').length;
    const tot = focusEndpoints.length;
    return {
      duration:   hrs.length ? Math.max(...hrs)+'h' : '—', readings:focusReadings.length,
      avgPh:      ph.length  ? (ph.reduce((s,v)=>s+v,0)/ph.length).toFixed(2) : '—',
      minPh:      ph.length  ? Math.min(...ph).toFixed(2) : '—',
      maxPh:      ph.length  ? Math.max(...ph).toFixed(2) : '—',
      avgTemp:    tmp.length ? (tmp.reduce((s,v)=>s+v,0)/tmp.length).toFixed(1) : '—',
      peakOd:     od.length  ? Math.max(...od).toFixed(3) : '—',
      brixDelta:  bx.length>1 ? (bx[0]-bx[bx.length-1]).toFixed(1) : '—',
      finalPh:    tot ? (focusEndpoints.reduce((s,e)=>s+Number(e.final_ph||0),0)/tot).toFixed(2) : '—',
      pass:p, total:tot, passRate:tot?Math.round(p/tot*100)+'%':'—',
    };
  }, [focusBatch, focusReadings, focusEndpoints]);

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    toast.info('Generating PDF...');
    try {
      const canvas = await html2canvas(reportRef.current, { scale:2 });
      const img    = canvas.toDataURL('image/png');
      const pdf    = new jsPDF('p','mm','a4');
      const pw     = pdf.internal.pageSize.getWidth();
      const ph     = (canvas.height*pw)/canvas.width;
      pdf.setFontSize(15);
      pdf.text('Batch Analytics — '+(focusBatch?focusBatch.batch_id:selectedProduct), 10, 11);
      pdf.setFontSize(9); pdf.text('Generated: '+new Date().toLocaleString(), 10, 17);
      pdf.addImage(img,'PNG',0,22,pw,ph);
      pdf.save('OxyOS_Analytics_'+new Date().toISOString().split('T')[0]+'.pdf');
      toast.success('Report downloaded');
    } catch (e) { toast.error('PDF generation failed'); console.error(e); }
  };

  const lineOpts = (xL, yL, yOpts = {}) => ({
    responsive:true, maintainAspectRatio:false,
    scales:{ x:{type:'linear',title:{display:true,text:xL,font:{size:11}}}, y:{title:{display:true,text:yL,font:{size:11}}, ...yOpts} },
    plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>yL+': '+ctx.parsed.y+' @ '+ctx.parsed.x+'h' } } }
  });
  const overlayOpts = (xL, yL, yOpts = {}) => ({
    responsive:true, maintainAspectRatio:false,
    scales:{ x:{type:'linear',title:{display:true,text:xL}}, y:{title:{display:true,text:yL}, ...yOpts} },
    plugins:{ legend:{position:'right',labels:{boxWidth:11,font:{size:10}}}, tooltip:{ callbacks:{ label:ctx=>ctx.dataset.label+': '+ctx.parsed.y+' @ '+ctx.parsed.x+'h' } } }
  });
  const dualOpts = {
    responsive:true, maintainAspectRatio:false,
    scales:{
      x: {type:'linear',title:{display:true,text:'Elapsed Hours',font:{size:11}}},
      y: {type:'linear',position:'left', title:{display:true,text:'pH',   font:{size:11}},grid:{color:'rgba(0,0,0,0.04)'}, suggestedMin: 3, suggestedMax: 7},
      y1:{type:'linear',position:'right',title:{display:true,text:'OD600',font:{size:11}},grid:{drawOnChartArea:false}}
    },
    plugins:{ legend:{display:true,position:'top',labels:{boxWidth:14,font:{size:11}}}, tooltip:{mode:'index',intersect:false} }
  };
  const barOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>'mu = '+ctx.parsed.y+' h-1' } } },
    scales:{ x:{title:{display:true,text:'Time Midpoint (h)'}}, y:{title:{display:true,text:'Growth Rate mu (h-1)'}} }
  };
  const donutOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} };
  const bubbleOpts = {
    responsive:true, maintainAspectRatio:false,
    scales:{ x:{type:'linear',title:{display:true,text:'Total Hours to Endpoint'}}, y:{title:{display:true,text:'Final pH'}} },
    plugins:{ tooltip:{ callbacks:{ label:ctx=>ctx.raw.batch+' ('+ctx.parsed.x+'h, pH '+ctx.parsed.y+', '+ctx.raw.temp+'C)' } } }
  };

  return (
    <div className="space-y-6">

      {/* Filter bar */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-end border border-slate-200/50 bg-white flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Product</label>
          <div className="relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400 outline-none">
              <option value="ALL">All Products</option>
              {products.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Date Range</label>
          <select value={dateRange} onChange={e=>setDateRange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400 outline-none">
            <option value="1M">Last 1 Month</option>
            <option value="3M">Last 3 Months</option>
            <option value="6M">Last 6 Months</option>
            <option value="1Y">Last 1 Year</option>
            <option value="ALL">All Time</option>
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Batch Focus</label>
          <div className="relative">
            <FlaskConical className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select value={focusBatchId} onChange={e=>{setFocusBatchId(e.target.value);setActiveTab('overview');}}
              className="w-full pl-8 pr-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-400 outline-none text-indigo-800">
              <option value="ALL">-- All Batches (Overlay) --</option>
              {batches.map(b=><option key={b.id} value={b.id}>{b.batch_id}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/batches" className="px-3 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl flex items-center hover:bg-slate-50 transition-colors text-sm shadow-sm">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open Module
          </Link>
          <button onClick={handleExportPdf} className="px-5 py-2 bg-slate-800 text-white font-bold rounded-xl flex items-center hover:bg-slate-700 transition-colors shadow-sm text-sm">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-20 text-slate-300">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div ref={reportRef} className="space-y-5">

          {focusBatchId !== 'ALL' && focusBatch ? (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 rounded-2xl p-5 text-white flex flex-col sm:flex-row sm:items-center gap-3 shadow-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-1">Single Batch Deep-Dive</p>
                  <h2 className="text-2xl font-black">{focusBatch.batch_id}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-indigo-200">
                    <span>{focusBatch.product_name}</span>
                    <span className="opacity-40">|</span>
                    <span>Created {new Date(focusBatch.created_at).toLocaleDateString()}</span>
                    <span className={'px-2 py-0.5 rounded-full font-bold text-[11px] '+(focusBatch.status==='Completed'?'bg-emerald-400/30 text-emerald-100':focusBatch.status==='Active'?'bg-yellow-400/30 text-yellow-100':'bg-white/15 text-white/70')}>
                      {focusBatch.status}
                    </span>
                  </div>
                </div>
                <button onClick={()=>setFocusBatchId('ALL')}
                  className="shrink-0 px-4 py-2 bg-white/15 hover:bg-white/25 transition-colors rounded-xl text-sm font-bold border border-white/25">
                  Back to Overlay
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
                {TABS.map(({id,label,Icon})=>(
                  <button key={id} onClick={()=>setActiveTab(id)}
                    className={'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all '+(activeTab===id?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700')}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>

              {/* ── Overview ── */}
              {activeTab==='overview' && (
                <div className="space-y-5">
                  {focusStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <StatCard icon={Clock}        label="Duration"       value={focusStats.duration}   sub={focusStats.readings+' readings'}                         color="text-indigo-600"  bg="bg-indigo-50"  />
                      <StatCard icon={Droplets}     label="Avg pH"         value={focusStats.avgPh}      sub={'Min '+focusStats.minPh+' / Max '+focusStats.maxPh}       color="text-blue-600"    bg="bg-blue-50"    />
                      <StatCard icon={Thermometer}  label="Avg Temp"       value={focusStats.avgTemp+'C'} sub="Incubator"                                              color="text-amber-600"   bg="bg-amber-50"   />
                      <StatCard icon={Zap}          label="Peak OD600"     value={focusStats.peakOd}     sub="Max optical density"                                      color="text-emerald-600" bg="bg-emerald-50" />
                      <StatCard icon={TrendingDown} label="Brix Consumed"  value={focusStats.brixDelta!=='—'?focusStats.brixDelta+' Bx':'—'} sub="Sugar used up"       color="text-violet-600"  bg="bg-violet-50"  />
                      <StatCard icon={focusStats.pass===focusStats.total&&focusStats.total>0?CheckCircle:XCircle}
                        label="Sensory" value={focusStats.passRate} sub={focusStats.pass+'/'+focusStats.total+' flasks'}
                        color={focusStats.pass===focusStats.total&&focusStats.total>0?'text-emerald-600':'text-red-500'}
                        bg={focusStats.pass===focusStats.total&&focusStats.total>0?'bg-emerald-50':'bg-red-50'} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <ChartCard title="pH Over Time" subtitle="Fermentation acidification trend" Icon={Droplets}>
                      <div className="h-60">{singlePhData.datasets[0].data.length===0?<EmptyChart msg="No pH readings."/>:<Line data={singlePhData} options={lineOpts('Elapsed Hours','pH', { suggestedMin: 3, suggestedMax: 7 })}/>}</div>
                    </ChartCard>
                    <ChartCard title="Incubator Temperature" subtitle="Temperature stability log" Icon={Thermometer}>
                      <div className="h-60">{singleTempData.datasets[0].data.length===0?<EmptyChart msg="No temperature readings."/>:<Line data={singleTempData} options={lineOpts('Elapsed Hours','Temp (C)', { suggestedMin: 20, suggestedMax: 45 })}/>}</div>
                    </ChartCard>
                  </div>
                  {focusEndpoints.length>0 && (
                    <div className="glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                          <FlaskConical className="w-3.5 h-3.5 text-violet-500"/> Flask Endpoints
                        </h3>
                        <span className="text-[11px] text-slate-400">{focusEndpoints.length} flask{focusEndpoints.length>1?'s':''}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                            <tr>
                              <th className="text-left px-5 py-3">Flask</th>
                              <th className="text-left px-5 py-3">Total Hrs</th>
                              <th className="text-left px-5 py-3">Final pH</th>
                              <th className="text-left px-5 py-3">TA (%)</th>
                              <th className="text-left px-5 py-3">Aroma</th>
                              <th className="text-left px-5 py-3">Colour</th>
                              <th className="text-left px-5 py-3">Sensory</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {focusEndpoints.map((ep,i)=>(
                              <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-5 py-3 font-semibold text-slate-700">{ep.flask_id||'Flask '+(i+1)}</td>
                                <td className="px-5 py-3 text-slate-500">{ep.total_hours!=null?ep.total_hours+'h':'—'}</td>
                                <td className="px-5 py-3 font-semibold text-blue-700">{ep.final_ph??'—'}</td>
                                <td className="px-5 py-3 text-slate-500">{ep.titratable_acidity_pct!=null?ep.titratable_acidity_pct+'%':'—'}</td>
                                <td className="px-5 py-3 text-slate-500">{ep.aroma||'—'}</td>
                                <td className="px-5 py-3 text-slate-500">{ep.colour_desc||'—'}</td>
                                <td className="px-5 py-3">
                                  <span className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold '+(ep.sensory_overall==='FAIL'?'bg-red-100 text-red-700':'bg-emerald-100 text-emerald-700')}>
                                    {ep.sensory_overall==='FAIL'?<><XCircle className="w-3 h-3"/>FAIL</>:<><CheckCircle className="w-3 h-3"/>PASS</>}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Growth Analysis ── */}
              {activeTab==='growth' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={TrendingUp} label="Peak Growth Rate umax" value={growthKinetics.peakMu!=='—'?growthKinetics.peakMu+' h-1':'—'} sub="Specific growth rate"    color="text-emerald-600" bg="bg-emerald-50"/>
                    <StatCard icon={Clock}      label="Min Doubling Time"     value={growthKinetics.minDoubling!=='—'?growthKinetics.minDoubling+'h':'—'} sub="td = ln(2) / umax" color="text-indigo-600"  bg="bg-indigo-50"/>
                    <StatCard icon={Zap}        label="OD at Inoculation"     value={growthKinetics.odStart}       sub="Starting cell density"                       color="text-blue-600"    bg="bg-blue-50"/>
                    <StatCard icon={BarChart2}  label="Peak OD600"            value={focusStats?focusStats.peakOd:'—'} sub="Max biomass"                             color="text-violet-600"  bg="bg-violet-50"/>
                  </div>
                  <ChartCard title="OD600 Growth Curve" subtitle="Log phase = steep rise. Stationary = plateau. Decline = drop. Used to identify optimal harvest time." Icon={TrendingUp}>
                    <div className="h-72">
                      {singleOdData.datasets[0].data.length===0?<EmptyChart msg="No OD readings for this batch yet."/>:<Line data={singleOdData} options={lineOpts('Elapsed Hours','OD600')}/>}
                    </div>
                  </ChartCard>
                  {growthKinetics.rates.length>0?(
                    <ChartCard title="Specific Growth Rate (mu) Per Interval" subtitle="Green = growth phase (mu > 0). Red = decline. Formula: mu = (ln OD2 minus ln OD1) / (t2 minus t1). Doubling time: td = ln(2) / mu." Icon={Activity}>
                      <div className="h-64"><Bar data={growthKinetics.barData} options={barOpts}/></div>
                      {growthKinetics.peakMu!=='—' && (
                        <p className="text-[11px] font-semibold text-emerald-600 mt-3">
                          Peak mu = {growthKinetics.peakMu} h-1  |  Minimum doubling time = {growthKinetics.minDoubling}h
                        </p>
                      )}
                    </ChartCard>
                  ):(
                    <div className="glass-card rounded-2xl border border-slate-200/50 bg-white p-10 text-center text-slate-400 text-sm">
                      At least 2 OD600 readings needed to compute growth rate intervals. Keep logging!
                    </div>
                  )}
                </div>
              )}

              {/* ── Process Trends ── */}
              {activeTab==='trends' && (
                <div className="space-y-5">
                  <ChartCard title="pH vs OD600 — Dual Axis Correlation" subtitle="pH left axis (indigo solid). OD600 right axis (green dashed). Rising OD typically correlates with falling pH." Icon={Activity}>
                    <div className="h-72">
                      {phOdDualData.datasets[0].data.length===0&&phOdDualData.datasets[1].data.length===0
                        ?<EmptyChart msg="No data for dual-axis chart."/>
                        :<Line data={phOdDualData} options={dualOpts}/>}
                    </div>
                  </ChartCard>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <ChartCard title="Brix (Sugar) Consumption" subtitle="Brix decline = substrate utilisation. Steeper slope = faster fermentation rate." Icon={Wind}>
                      <div className="h-60">
                        {singleBrixData.datasets[0].data.length===0?<EmptyChart msg="No Brix readings logged."/>:<Line data={singleBrixData} options={lineOpts('Elapsed Hours','Brix (Bx)')}/>}
                      </div>
                    </ChartCard>
                    <ChartCard title="Titratable Acidity (TA)" subtitle="Rising TA% confirms lactic acid production. Should mirror falling pH trend." Icon={Layers}>
                      <div className="h-60">
                        {singleTaData.datasets[0].data.length===0?<EmptyChart msg="No TA readings logged."/>:<Line data={singleTaData} options={lineOpts('Elapsed Hours','TA (%)')}/>}
                      </div>
                    </ChartCard>
                  </div>
                </div>
              )}

              {/* ── Data Table ── */}
              {activeTab==='table' && (
                <div className="glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <List className="w-3.5 h-3.5 text-slate-400"/> Fermentation Readings Log
                    </h3>
                    <span className="text-[11px] text-slate-400">{focusReadings.length} readings</span>
                  </div>
                  {focusReadings.length===0
                    ?<div className="p-10 text-center text-slate-400 text-sm">No readings recorded for this batch.</div>
                    :(
                      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 font-bold sticky top-0 z-10">
                            <tr>
                              <th className="text-left px-4 py-3">Time (h)</th>
                              <th className="text-left px-4 py-3">pH</th>
                              <th className="text-left px-4 py-3">OD600</th>
                              <th className="text-left px-4 py-3">Brix</th>
                              <th className="text-left px-4 py-3">Temp (C)</th>
                              <th className="text-left px-4 py-3">TA (%)</th>
                              <th className="text-left px-4 py-3">Foam</th>
                              <th className="text-left px-4 py-3">Plating</th>
                              <th className="text-left px-4 py-3">Appearance</th>
                              <th className="text-left px-4 py-3">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {focusReadings.map((r,i)=>(
                              <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-slate-700">{r.elapsed_hours??'—'}</td>
                                <td className="px-4 py-2.5 font-semibold text-blue-700">{r.ph??'—'}</td>
                                <td className="px-4 py-2.5 font-semibold text-emerald-700">{r.optical_density??'—'}</td>
                                <td className="px-4 py-2.5 text-violet-700">{r.brix??'—'}</td>
                                <td className="px-4 py-2.5 text-amber-700">{r.incubator_temp_c??'—'}</td>
                                <td className="px-4 py-2.5 text-red-700">{r.titratable_acidity_pct??'—'}</td>
                                <td className="px-4 py-2.5 text-slate-500">{r.foam_level||'—'}</td>
                                <td className="px-4 py-2.5 text-slate-500">{r.plating_result||'—'}</td>
                                <td className="px-4 py-2.5 text-slate-500">{r.visual_appearance||'—'}</td>
                                <td className="px-4 py-2.5 text-slate-400 max-w-[180px] truncate">{r.notes||'—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              )}
            </>
          ) : (
            /* ── ALL-BATCH OVERLAY ── */
            <>
              {batches.length>0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Quick-pick:</span>
                  {batches.map((b,idx)=>(
                    <button key={b.id} onClick={()=>{setFocusBatchId(b.id);setActiveTab('overview');}}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:scale-105 active:scale-95"
                      style={{borderColor:COLORS[idx%COLORS.length],color:COLORS[idx%COLORS.length],backgroundColor:COLORS[idx%COLORS.length]+'18'}}>
                      {b.batch_id}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="pH Progression Overlay" subtitle="All batches overlaid. Red dots = anomalies over 15% from hist avg. Click chip to isolate." Icon={Activity}>
                  <div className="h-72">{phChartData.datasets.length===0?<EmptyChart msg="No fermentation data."/>:<Line data={phChartData} options={overlayOpts('Elapsed Hours','pH', { suggestedMin: 3, suggestedMax: 7 })}/>}</div>
                </ChartCard>
                <ChartCard title="OD600 Growth Curves Overlay" subtitle="Compare biomass build-up across batches. Steeper curve = faster growth." Icon={TrendingUp}>
                  <div className="h-72">{odOverlayData.datasets.length===0?<EmptyChart msg="No OD readings across batches."/>:<Line data={odOverlayData} options={overlayOpts('Elapsed Hours','OD600')}/>}</div>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="Brix Consumption Overlay" subtitle="Steeper decline = faster substrate utilisation. Good proxy for fermentation rate." Icon={Wind}>
                  <div className="h-64">{brixOverlayData.datasets.length===0?<EmptyChart msg="No Brix readings across batches."/>:<Line data={brixOverlayData} options={overlayOpts('Elapsed Hours','Brix (Bx)')}/>}</div>
                </ChartCard>
                <ChartCard title="Sweet Spot — Duration vs Final pH" subtitle="Bubble size = avg incubator temp. Green = PASS, Red = FAIL sensory." Icon={Layers}>
                  <div className="h-64">
                    {endpoints.filter(e=>e.total_hours!=null&&e.final_ph!=null).length===0
                      ?<EmptyChart msg="No flask endpoint data."/>
                      :<Bubble data={endpointBubbleData} options={bubbleOpts}/>}
                  </div>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <ChartCard title="Sensory PASS / FAIL" subtitle={'Total: '+endpoints.length+' flask endpoint(s)'} Icon={CheckCircle}>
                  <div className="h-56">{endpoints.length===0?<EmptyChart msg="No endpoint data."/>:<Doughnut data={sensoryDonutData} options={donutOpts}/>}</div>
                </ChartCard>
                <div className="lg:col-span-2 glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <BarChart2 className="w-3.5 h-3.5 text-slate-400"/> Cross-Batch Comparison
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Click any row to drill into that batch</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                        <tr>
                          <th className="text-left px-4 py-3">Batch</th>
                          <th className="text-left px-4 py-3">Duration</th>
                          <th className="text-left px-4 py-3">Avg pH</th>
                          <th className="text-left px-4 py-3">Peak OD</th>
                          <th className="text-left px-4 py-3">Brix</th>
                          <th className="text-left px-4 py-3">Final pH</th>
                          <th className="text-left px-4 py-3">Sensory</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {crossBatchStats.map((row,i)=>(
                          <tr key={i} onClick={()=>{setFocusBatchId(row.id);setActiveTab('overview');}}
                            className="hover:bg-indigo-50/40 cursor-pointer transition-colors">
                            <td className="px-4 py-2.5 font-bold text-indigo-700">{row.batch_id}</td>
                            <td className="px-4 py-2.5 text-slate-500">{row.duration}</td>
                            <td className="px-4 py-2.5 font-semibold text-blue-700">{row.avgPh}</td>
                            <td className="px-4 py-2.5 font-semibold text-emerald-700">{row.peakOd}</td>
                            <td className="px-4 py-2.5 text-slate-500">{row.brixStart} to {row.brixEnd}</td>
                            <td className="px-4 py-2.5 text-slate-600">{row.finalPh}</td>
                            <td className="px-4 py-2.5">
                              <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold '+(row.sensory.includes('PASS')?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500')}>
                                {row.sensory}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {crossBatchStats.length===0&&(
                          <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No batches in current filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {batches.length===0&&(
                <div className="text-center py-10 text-slate-400 font-medium">No batch data for selected filters.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
