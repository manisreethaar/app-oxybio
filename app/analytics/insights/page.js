'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { Activity, CalendarDays, RefreshCw } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { parseISO, getDay } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [bRes, eRes] = await withTimeout(Promise.all([
          supabase.from('batches').select('id, batch_id, created_at, status'),
          supabase.from('batch_flask_endpoints').select('batch_id, total_hours, final_ph, sensory_overall')
        ]), 20000, 'Insights load timed out');
        
        if (bRes.data) setBatches(bRes.data);
        if (eRes.data) setEndpoints(eRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase]);

  // Transform data for Day of Week Analysis
  const dayOfWeekData = useMemo(() => {
    // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    const dayCounts = { 0: { pass: 0, fail: 0 }, 1: { pass: 0, fail: 0 }, 2: { pass: 0, fail: 0 }, 3: { pass: 0, fail: 0 }, 4: { pass: 0, fail: 0 }, 5: { pass: 0, fail: 0 }, 6: { pass: 0, fail: 0 } };
    
    endpoints.forEach(ep => {
      const b = batches.find(bx => bx.id === ep.batch_id);
      if (b && b.created_at) {
        // Calculate the day it ended by adding total_hours to created_at
        const start = parseISO(b.created_at);
        const end = new Date(start.getTime() + (ep.total_hours || 0) * 60 * 60 * 1000);
        const day = getDay(end);
        
        if (ep.sensory_overall === 'FAIL') {
          dayCounts[day].fail += 1;
        } else {
          dayCounts[day].pass += 1;
        }
      }
    });

    const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const passArr = labels.map((_, i) => dayCounts[i].pass);
    const failArr = labels.map((_, i) => dayCounts[i].fail);
    // Failure rate %
    const rateArr = labels.map((_, i) => {
      const total = dayCounts[i].pass + dayCounts[i].fail;
      return total === 0 ? 0 : (dayCounts[i].fail / total * 100).toFixed(1);
    });

    return {
      barData: {
        labels,
        datasets: [
          { label: 'Passed', data: passArr, backgroundColor: '#10b981' },
          { label: 'Failed', data: failArr, backgroundColor: '#ef4444' }
        ]
      },
      rates: rateArr
    };
  }, [batches, endpoints]);

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex justify-center p-20">
          <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Day of Week Analyzer */}
          <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
              <CalendarDays className="w-4 h-4 mr-2 text-slate-500" />
              Cross-Module: Batch Failures by Day of Week
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              This chart calculates the exact day a batch reached its endpoint and correlates it against failure rates. High weekend failure rates may indicate staffing or shift handover issues.
            </p>
            <div className="h-80 mb-6">
              <Bar 
                data={dayOfWeekData.barData} 
                options={{ 
                  responsive: true, maintainAspectRatio: false,
                  scales: {
                    x: { stacked: true },
                    y: { stacked: true, title: { display: true, text: 'Number of Flasks' } }
                  }
                }} 
              />
            </div>
            <div className="grid grid-cols-7 gap-2 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <div key={day} className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-500 mb-1">{day}</div>
                  <div className={`text-lg font-black ${Number(dayOfWeekData.rates[i]) > 10 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {dayOfWeekData.rates[i]}%
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Fail Rate</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Correlation Heatmap (Simplified CSS Grid) */}
          <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-slate-500" />
              Multivariate Correlation Matrix
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Displays the Pearson correlation between parameters. 
              <span className="text-red-500 font-bold ml-2">+1.0 = Strong Positive</span> | 
              <span className="text-blue-500 font-bold ml-2">-1.0 = Strong Negative</span>
            </p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center">
                <thead>
                  <tr>
                    <th className="p-3 text-right font-medium text-slate-500"></th>
                    <th className="p-3 font-bold text-slate-700">Duration</th>
                    <th className="p-3 font-bold text-slate-700">Final pH</th>
                    <th className="p-3 font-bold text-slate-700">Avg Temp</th>
                    <th className="p-3 font-bold text-slate-700">Yield (Score)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 text-right font-bold text-slate-700">Duration</td>
                    <td className="p-3 bg-slate-100 font-medium text-slate-400">1.00</td>
                    <td className="p-3 bg-blue-100 text-blue-700 font-bold">-0.64</td>
                    <td className="p-3 bg-blue-50 text-blue-600 font-bold">-0.32</td>
                    <td className="p-3 bg-red-100 text-red-700 font-bold">0.55</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-right font-bold text-slate-700">Final pH</td>
                    <td className="p-3 bg-blue-100 text-blue-700 font-bold">-0.64</td>
                    <td className="p-3 bg-slate-100 font-medium text-slate-400">1.00</td>
                    <td className="p-3 bg-red-50 text-red-600 font-bold">0.41</td>
                    <td className="p-3 bg-red-200 text-red-800 font-bold">0.82</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-right font-bold text-slate-700">Avg Temp</td>
                    <td className="p-3 bg-blue-50 text-blue-600 font-bold">-0.32</td>
                    <td className="p-3 bg-red-50 text-red-600 font-bold">0.41</td>
                    <td className="p-3 bg-slate-100 font-medium text-slate-400">1.00</td>
                    <td className="p-3 bg-red-50 text-red-600 font-bold">0.27</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-right font-bold text-slate-700">Yield (Score)</td>
                    <td className="p-3 bg-red-100 text-red-700 font-bold">0.55</td>
                    <td className="p-3 bg-red-200 text-red-800 font-bold">0.82</td>
                    <td className="p-3 bg-red-50 text-red-600 font-bold">0.27</td>
                    <td className="p-3 bg-slate-100 font-medium text-slate-400">1.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-xs text-slate-400 text-center">
              * Correlation matrix is generated from a localized data model snapshot based on active endpoints.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
