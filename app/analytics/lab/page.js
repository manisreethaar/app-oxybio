'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { BarChart2, Download, Filter, RefreshCw, FlaskConical } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, BarController
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, BarController);

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function LabAnalyticsPage() {
  const [samples, setSamples] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const toast = useToast();
  const reportRef = useRef();

  const [dateRange, setDateRange] = useState('6M');

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        let fromDate = new Date();
        if (dateRange === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
        else if (dateRange === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
        else if (dateRange === '6M') fromDate.setMonth(fromDate.getMonth() - 6);
        else if (dateRange === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
        else fromDate = new Date(2000, 0, 1);

        const { data: sampleData, error: sErr } = await supabase
          .from('samples')
          .select('id, source_label, flask_label, log_hour, collected_at')
          .gte('collected_at', fromDate.toISOString());

        if (sErr) throw sErr;

        if (sampleData.length > 0) {
          const sampleIds = sampleData.map(s => s.id);
          const { data: trData, error: trErr } = await supabase
            .from('test_results')
            .select('sample_id, test_type, numeric_value, detail, skipped')
            .in('sample_id', sampleIds)
            .in('test_type', ['od', 'plate_analysis'])
            .eq('skipped', false);
            
          if (trErr) throw trErr;
          setTestResults(trData);
        } else {
          setTestResults([]);
        }

        setSamples(sampleData);
      } catch (err) {
        toast.error('Failed to load lab analytics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [dateRange, supabase]);

  // Transform OD Data (Line Chart)
  const odChartData = useMemo(() => {
    const datasets = [];
    const sources = [...new Set(samples.map(s => s.source_label).filter(Boolean))];

    sources.forEach((source, idx) => {
      // Find all samples for this source
      const sourceSamples = samples.filter(s => s.source_label === source);
      const sourceSampleIds = sourceSamples.map(s => s.id);
      
      // Get OD tests for these samples
      const odTests = testResults.filter(tr => tr.test_type === 'od' && sourceSampleIds.includes(tr.sample_id));
      
      if (odTests.length > 0) {
        // Map back to log_hour
        const points = odTests.map(tr => {
          const s = sourceSamples.find(x => x.id === tr.sample_id);
          return { x: Number(s.log_hour || 0), y: Number(tr.numeric_value || 0) };
        }).sort((a,b) => a.x - b.x);

        datasets.push({
          label: source,
          data: points,
          borderColor: COLORS[idx % COLORS.length],
          backgroundColor: COLORS[idx % COLORS.length],
          borderWidth: 2,
          pointRadius: 4,
          fill: false,
          tension: 0.1
        });
      }
    });
    return { datasets };
  }, [samples, testResults]);

  // Transform Plate Analysis Data (Bar Chart)
  const plateChartData = useMemo(() => {
    const labels = [];
    const counts = [];
    
    // Sort samples by collected_at
    const sortedSamples = [...samples].sort((a,b) => new Date(a.collected_at) - new Date(b.collected_at));

    sortedSamples.forEach(s => {
      const plates = testResults.filter(tr => tr.test_type === 'plate_analysis' && tr.sample_id === s.id);
      plates.forEach(plate => {
        const count = plate.detail?.plate_count;
        if (count != null && !isNaN(Number(count))) {
          labels.push(`${s.source_label} ${s.flask_label || ''} T+${s.log_hour || 0}h`);
          counts.push(Number(count));
        }
      });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Plate Count (CFU)',
          data: counts,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }
      ]
    };
  }, [samples, testResults]);

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
      pdf.text(`Lab & Growth Analytics Report`, 10, 10);
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleString()}`, 10, 15);
      
      pdf.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
      pdf.save(`OxyOS_Lab_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
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
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Date Range</label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
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
          
          <div className="grid grid-cols-1 gap-6">
            {/* OD Overlay Chart */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <BarChart2 className="w-4 h-4 mr-2 text-indigo-500" />
                Optical Density (OD) Progression
              </h3>
              <div className="h-80">
                <Line 
                  data={odChartData} 
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                      x: { type: 'linear', title: { display: true, text: 'Elapsed Hours' } },
                      y: { title: { display: true, text: 'OD Value' }, beginAtZero: true }
                    },
                    plugins: {
                      legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
                    }
                  }} 
                />
              </div>
            </div>

            {/* Plate Analysis Bar Chart */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <FlaskConical className="w-4 h-4 mr-2 text-amber-500" />
                Plate Analysis (CFU Counts)
              </h3>
              <div className="h-80">
                <Bar 
                  data={plateChartData}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                      y: { title: { display: true, text: 'CFU Count' }, beginAtZero: true }
                    },
                    plugins: {
                      legend: { display: false }
                    }
                  }}
                />
              </div>
            </div>
          </div>
          
          {samples.length === 0 && (
            <div className="text-center py-10 text-slate-400 font-medium">
              No lab bench data found for the selected time range.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
