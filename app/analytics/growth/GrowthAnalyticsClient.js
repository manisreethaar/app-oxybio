'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useToast } from '@/context/ToastContext';
import { Activity, Download, RefreshCw, TrendingUp, FlaskConical, ExternalLink } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Link from 'next/link';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, BarElement, BarController
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, BarController);

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function GrowthAnalyticsClient({ initialBatches = [], initialReadings = [], initialProducts = [] }) {
  const [studies, setStudies] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('6M');
  const [selectedStudyType, setSelectedStudyType] = useState('ALL');
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const reportRef = useRef();

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

        let studyQuery = supabase
          .from('growth_studies')
          .select('id, study_code, name, study_type, status, temperature_c, completed_at, created_at, cell_bank_strains(name), formulations(name)')
          .is('archived_at', null)
          .gte('created_at', fromDate.toISOString())
          .order('created_at', { ascending: false });

        if (selectedStudyType !== 'ALL') {
          studyQuery = studyQuery.eq('study_type', selectedStudyType);
        }

        const { data: studyData, error: studyErr } = await withTimeout(studyQuery, 45000, 'Study query timed out');
        if (studyErr) throw studyErr;

        const studyIds = (studyData || []).map(s => s.id);

        if (studyIds.length > 0) {
          const { data: measData } = await withTimeout(supabase
            .from('growth_measurements')
            .select('study_id, actual_hour, od_value, ph_value, glucose_g_l')
            .in('study_id', studyIds)
            .order('actual_hour'), 45000, 'Measurements query timed out');
          setMeasurements(measData || []);
        } else {
          setMeasurements([]);
        }

        setStudies(studyData || []);
      } catch (err) {
        toast.error('Failed to load growth analytics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedStudyType]);

  // OD Growth Curves — one line per study
  const odChartData = useMemo(() => {
    const datasets = [];
    studies.forEach((s, idx) => {
      const studyMeas = measurements
        .filter(m => m.study_id === s.id && m.od_value != null)
        .sort((a, b) => a.actual_hour - b.actual_hour);

      if (studyMeas.length > 0) {
        datasets.push({
          label: s.study_code || s.name,
          data: studyMeas.map(m => ({ x: Number(m.actual_hour), y: Number(m.od_value) })),
          borderColor: COLORS[idx % COLORS.length],
          backgroundColor: COLORS[idx % COLORS.length],
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.2,
        });
      }
    });
    return { datasets };
  }, [studies, measurements]);

  // Studies by type bar chart
  const studyTypeData = useMemo(() => {
    const typeCounts = {};
    studies.forEach(s => {
      const type = s.study_type || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    return {
      labels: Object.keys(typeCounts),
      datasets: [{
        label: 'Studies',
        data: Object.values(typeCounts),
        backgroundColor: COLORS.slice(0, Object.keys(typeCounts).length),
        borderRadius: 6,
      }]
    };
  }, [studies]);

  // Completion rate KPIs
  const kpis = useMemo(() => {
    const completed = studies.filter(s => s.status === 'completed').length;
    const total = studies.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const uniqueStrains = new Set(studies.map(s => s.cell_bank_strains?.name).filter(Boolean)).size;
    return { total, completed, completionRate, uniqueStrains };
  }, [studies]);

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
      pdf.text('Growth Studies Analytics Report', 10, 10);
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleString()}`, 10, 15);
      pdf.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
      pdf.save(`OxyOS_Growth_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error('Failed to generate PDF');
    }
  };

  const STUDY_TYPES = ['Growth Kinetics', 'Fermentation', 'Plate Count', 'OD Monitoring', 'Stability', 'Inoculum Prep'];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-end border border-slate-200/50">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Study Type</label>
          <select
            value={selectedStudyType}
            onChange={e => setSelectedStudyType(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-500 outline-none"
          >
            <option value="ALL">All Types</option>
            {STUDY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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

        <div className="flex gap-2">
          <Link
            href="/growth-studies"
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
              { label: 'Total Studies', value: kpis.total, icon: FlaskConical, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Completed', value: kpis.completed, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Completion Rate', value: `${kpis.completionRate}%`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Unique Strains', value: kpis.uniqueStrains, icon: FlaskConical, color: 'text-purple-600', bg: 'bg-purple-50' },
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
            {/* OD Growth Curves */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-indigo-500" />
                OD Growth Curve Overlay
              </h3>
              <div className="h-72">
                {odChartData.datasets.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium text-center">
                    No OD measurement data for this period.<br />Log readings via Growth Studies.
                  </div>
                ) : (
                  <Line
                    data={odChartData}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      scales: {
                        x: { type: 'linear', title: { display: true, text: 'Hours' } },
                        y: { title: { display: true, text: 'OD Value' }, beginAtZero: true }
                      },
                      plugins: {
                        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Studies by Type */}
            <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-amber-500" />
                Studies by Type
              </h3>
              <div className="h-72">
                {studies.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                    No growth studies found for this period.
                  </div>
                ) : (
                  <Bar
                    data={studyTypeData}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Count' } }
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
                      {['Code', 'Name', 'Type', 'Strain', 'Status', 'Temp (°C)', ''].map(h => (
                        <th key={h} className="pb-2 text-left font-black text-slate-400 uppercase tracking-wider pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {studies.slice(0, 8).map(s => (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2 font-mono font-bold text-slate-700 pr-4">{s.study_code}</td>
                        <td className="py-2 font-medium text-slate-700 pr-4 max-w-[150px] truncate">{s.name}</td>
                        <td className="py-2 text-slate-500 pr-4">{s.study_type}</td>
                        <td className="py-2 text-slate-500 pr-4">{s.cell_bank_strains?.name || '—'}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-black uppercase ${
                            s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            s.status === 'active' ? 'bg-slate-100 text-slate-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{s.status}</span>
                        </td>
                        <td className="py-2 text-slate-500 pr-4">{s.temperature_c ?? '—'}</td>
                        <td className="py-2">
                          <Link href={`/growth-studies/${s.id}`} className="text-indigo-600 hover:underline font-bold text-xs flex items-center gap-1">
                            View <ExternalLink className="w-3 h-3" />
                          </Link>
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
    </div>
  );
}
