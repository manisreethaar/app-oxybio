'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useToast } from '@/context/ToastContext';
import { Clock, Download, RefreshCw, AlertCircle, CheckCircle, ExternalLink, TrendingDown } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Link from 'next/link';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, BarElement, BarController
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, BarController);

const STORAGE_COLORS = {
  'Refrigerated (4°C)': '#3b82f6',
  'Room Temperature': '#f59e0b',
  'Frozen (-20°C)': '#6366f1',
  'Frozen (-80°C)': '#8b5cf6',
};

export default function StabilityAnalyticsPage() {
  const [studies, setStudies] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('1Y');
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const reportRef = useRef();

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        let fromDate = new Date();
        if (dateRange === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
        else if (dateRange === '6M') fromDate.setMonth(fromDate.getMonth() - 6);
        else if (dateRange === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
        else fromDate = new Date(2000, 0, 1);

        const { data: studyData, error } = await withTimeout(supabase
          .from('shelf_life_studies')
          .select('id, storage_condition, study_type, status, start_date, created_at, batches(batch_id, product_name), shelf_life_logs(id, day_number, test_data, created_at)')
          .is('archived_at', null)
          .gte('created_at', fromDate.toISOString())
          .order('created_at', { ascending: false }), 45000, 'Stability studies timed out');

        if (error) throw error;
        setStudies(studyData || []);
      } catch (err) {
        toast.error('Failed to load stability analytics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // KPIs
  const kpis = useMemo(() => {
    const total = studies.length;
    const active = studies.filter(s => s.status === 'ongoing').length;
    const completed = studies.filter(s => s.status === 'completed').length;
    const conditionCounts = {};
    studies.forEach(s => {
      const c = s.storage_condition || 'Unknown';
      conditionCounts[c] = (conditionCounts[c] || 0) + 1;
    });
    return { total, active, completed, conditionCounts };
  }, [studies]);

  // pH trend across shelf life logs (from test_data.pH field)
  const pHTimelineData = useMemo(() => {
    const datasets = [];
    studies.slice(0, 6).forEach((study, idx) => {
      if (!study.shelf_life_logs?.length) return;
      const points = study.shelf_life_logs
        .filter(l => l.test_data?.pH != null)
        .sort((a, b) => a.day_number - b.day_number)
        .map(l => ({ x: Number(l.day_number), y: Number(l.test_data.pH) }));
      if (points.length > 0) {
        const label = study.batches?.batch_id || `Study ${idx + 1}`;
        const color = Object.values(STORAGE_COLORS)[idx % Object.values(STORAGE_COLORS).length];
        datasets.push({
          label: `${label} (${study.storage_condition?.split(' ')[0] || ''})`,
          data: points,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 4,
          fill: false,
          tension: 0.2,
        });
      }
    });
    return { datasets };
  }, [studies]);

  // Studies by storage condition
  const conditionBarData = useMemo(() => {
    const counts = kpis.conditionCounts;
    return {
      labels: Object.keys(counts),
      datasets: [{
        label: 'Studies',
        data: Object.values(counts),
        backgroundColor: Object.keys(counts).map(k => STORAGE_COLORS[k] || '#94a3b8'),
        borderRadius: 6,
      }]
    };
  }, [kpis]);

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
      pdf.text('Stability Studies Analytics Report', 10, 10);
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleString()}`, 10, 15);
      pdf.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
      pdf.save(`OxyOS_Stability_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-end border border-slate-200/50">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Date Range</label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-500 outline-none"
          >
            <option value="3M">Last 3 Months</option>
            <option value="6M">Last 6 Months</option>
            <option value="1Y">Last 1 Year</option>
            <option value="ALL">All Time</option>
          </select>
        </div>

        <div className="flex gap-2">
          <Link
            href="/shelf-life"
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center hover:bg-slate-50 transition-colors text-sm"
          >
            <ExternalLink className="w-4 h-4 mr-1.5" /> Open Module
          </Link>
          <button
            onClick={handleDownloadReport}
            className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl flex items-center hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" /> Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-20 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div ref={reportRef} className="space-y-6 bg-slate-50/50 p-4 rounded-3xl">

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Studies', value: kpis.total, icon: Clock, color: 'text-slate-600', bg: 'bg-slate-50' },
              { label: 'Active', value: kpis.active, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Completed', value: kpis.completed, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Conditions Tested', value: Object.keys(kpis.conditionCounts).length, icon: TrendingDown, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(kpi => (
              <div key={kpi.label} className={`${kpi.bg} rounded-2xl p-4 flex items-center gap-3`}>
                <kpi.icon className={`w-7 h-7 ${kpi.color} shrink-0`} />
                <div>
                  <p className="text-2xl font-black text-slate-800">{kpi.value}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* pH Degradation Timeline */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <TrendingDown className="w-4 h-4 mr-2 text-slate-500" />
                pH Stability Over Days
              </h3>
              <div className="h-72">
                {pHTimelineData.datasets.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium text-center">
                    No pH data in shelf life logs for this period.<br />Log test data via Stability module.
                  </div>
                ) : (
                  <Line
                    data={pHTimelineData}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      scales: {
                        x: { type: 'linear', title: { display: true, text: 'Day' } },
                        y: { title: { display: true, text: 'pH' } }
                      },
                      plugins: {
                        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Studies by Storage Condition */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-purple-500" />
                Studies by Storage Condition
              </h3>
              <div className="h-72">
                {studies.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                    No stability studies found for this period.
                  </div>
                ) : (
                  <Bar
                    data={conditionBarData}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      indexAxis: 'y',
                      scales: {
                        x: { beginAtZero: true, ticks: { stepSize: 1 } }
                      },
                      plugins: { legend: { display: false } }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Recent Studies Table */}
          {studies.length > 0 && (
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Recent Studies</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Batch', 'Condition', 'Type', 'Start Date', 'Status', 'Log Count'].map(h => (
                        <th key={h} className="pb-2 text-left font-black text-slate-400 uppercase tracking-wider pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {studies.slice(0, 8).map(s => (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2 font-mono font-bold text-slate-700 pr-4">{s.batches?.batch_id || '—'}</td>
                        <td className="py-2 text-slate-600 pr-4">{s.storage_condition}</td>
                        <td className="py-2 text-slate-500 pr-4">{s.study_type}</td>
                        <td className="py-2 text-slate-500 pr-4">{s.start_date ? new Date(s.start_date).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-black uppercase ${
                            s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            s.status === 'ongoing' ? 'bg-slate-100 text-slate-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{s.status}</span>
                        </td>
                        <td className="py-2 text-slate-500">{s.shelf_life_logs?.length || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
