'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { Activity, Download, Filter, RefreshCw, Layers } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ScatterController
} from 'chart.js';
import { Scatter, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ScatterController);

const COLORS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
];

export default function BatchAnalyticsPage() {
  const [batches, setBatches] = useState([]);
  const [readings, setReadings] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const supabase = createClient();
  const toast = useToast();
  const reportRef = useRef();

  // Filters
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [dateRange, setDateRange] = useState('6M'); // 1M, 3M, 6M, 1Y, ALL

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        // Build date filter
        let fromDate = new Date();
        if (dateRange === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
        else if (dateRange === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
        else if (dateRange === '6M') fromDate.setMonth(fromDate.getMonth() - 6);
        else if (dateRange === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
        else fromDate = new Date(2000, 0, 1);

        let batchQuery = supabase
          .from('batches')
          .select('id, batch_id, created_at, status, product_name')
          .gte('created_at', fromDate.toISOString());

        if (selectedProduct !== 'ALL') {
          batchQuery = batchQuery.eq('product_name', selectedProduct);
        }

        const { data: bData, error: bErr } = await batchQuery;
        if (bErr) throw bErr;

        const batchIds = bData.map(b => b.id);
        
        // Extract unique products for the dropdown (only do this once or independent of current filter)
        if (products.length === 0) {
           const { data: allBData } = await supabase.from('batches').select('product_name');
           const uniqueProds = [...new Set((allBData||[]).map(b => b.product_name).filter(Boolean))];
           setProducts(uniqueProds);
        }

        if (batchIds.length > 0) {
          const [rRes, eRes] = await Promise.all([
            supabase.from('batch_fermentation_readings').select('batch_id, elapsed_hours, ph, incubator_temp_c').in('batch_id', batchIds),
            supabase.from('batch_fermentation_endpoint').select('batch_id, total_hours, final_ph, sensory_overall').in('batch_id', batchIds)
          ]);
          if (rRes.data) setReadings(rRes.data);
          if (eRes.data) setEndpoints(eRes.data);
        } else {
          setReadings([]);
          setEndpoints([]);
        }

        setBatches(bData);
      } catch (err) {
        toast.error('Failed to load batch analytics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [dateRange, selectedProduct, supabase]);

  // Transform data for Multi-Line pH Chart
  const phChartData = useMemo(() => {
    const datasets = [];
    batches.forEach((b, idx) => {
      const bReadings = readings.filter(r => r.batch_id === b.id && r.ph != null && r.elapsed_hours != null)
                                .sort((a, b) => a.elapsed_hours - b.elapsed_hours);
      if (bReadings.length > 0) {
        datasets.push({
          label: b.batch_id,
          data: bReadings.map(r => ({ x: Number(r.elapsed_hours), y: Number(r.ph) })),
          borderColor: COLORS[idx % COLORS.length],
          backgroundColor: COLORS[idx % COLORS.length],
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.2
        });
      }
    });
    return { datasets };
  }, [batches, readings]);

  // Transform data for Endpoint Scatter (Duration vs Final pH)
  const endpointScatterData = useMemo(() => {
    const passData = [];
    const failData = [];
    
    endpoints.forEach(ep => {
      const b = batches.find(bx => bx.id === ep.batch_id);
      const label = b ? b.batch_id : 'Unknown';
      if (ep.total_hours != null && ep.final_ph != null) {
        const pt = { x: Number(ep.total_hours), y: Number(ep.final_ph), batch: label };
        if (ep.sensory_overall === 'FAIL') failData.push(pt);
        else passData.push(pt);
      }
    });

    return {
      datasets: [
        {
          label: 'Passed Sensory',
          data: passData,
          backgroundColor: '#10b981',
          pointRadius: 6,
        },
        {
          label: 'Failed Sensory',
          data: failData,
          backgroundColor: '#ef4444',
          pointRadius: 6,
          pointStyle: 'triangle',
        }
      ]
    };
  }, [endpoints, batches]);

  const handleDownloadReport = async () => {
    if (!reportRef.current) return;
    toast.info('Generating PDF report...');
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.setFontSize(16);
      pdf.text(`Batch Analytics Report - ${selectedProduct}`, 10, 10);
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleString()}`, 10, 15);
      
      pdf.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
      pdf.save(`OxyOS_Batch_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error('Failed to generate PDF');
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-end border border-slate-200/50">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Product Filter</label>
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-500 outline-none"
            >
              <option value="ALL">All Products</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Date Range</label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-500 outline-none"
          >
            <option value="1M">Last 1 Month</option>
            <option value="3M">Last 3 Months</option>
            <option value="6M">Last 6 Months</option>
            <option value="1Y">Last 1 Year</option>
            <option value="ALL">All Time</option>
          </select>
        </div>

        <button
          onClick={handleDownloadReport}
          className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl flex items-center hover:bg-slate-700 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-20 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div ref={reportRef} className="space-y-6 bg-slate-50/50 p-4 rounded-3xl">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* pH Overlay Chart */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-slate-500" />
                pH Progression Overlay
              </h3>
              <div className="h-80">
                <Line 
                  data={phChartData} 
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                      x: { type: 'linear', title: { display: true, text: 'Elapsed Hours' } },
                      y: { title: { display: true, text: 'pH Level' } }
                    },
                    plugins: {
                      legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
                      tooltip: { callbacks: { label: (ctx) => `Batch ${ctx.dataset.label}: pH ${ctx.parsed.y} @ ${ctx.parsed.x}h` } }
                    }
                  }} 
                />
              </div>
            </div>

            {/* Endpoint Scatter */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <Layers className="w-4 h-4 mr-2 text-slate-500" />
                Endpoint Duration vs pH
              </h3>
              <div className="h-80">
                <Scatter 
                  data={endpointScatterData}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                      x: { type: 'linear', title: { display: true, text: 'Total Hours to Endpoint' } },
                      y: { title: { display: true, text: 'Final pH' } }
                    },
                    plugins: {
                      tooltip: { callbacks: { label: (ctx) => `${ctx.raw.batch} (Duration: ${ctx.parsed.x}h, pH: ${ctx.parsed.y})` } }
                    }
                  }}
                />
              </div>
            </div>
          </div>
          
          {batches.length === 0 && (
            <div className="text-center py-10 text-slate-400 font-medium">
              No batch data found for the selected filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
