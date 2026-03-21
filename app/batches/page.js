'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { FlaskConical, Plus, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { format, differenceInHours } from 'date-fns';

export default function BatchesPage() {
  const { role, loading } = useAuth();
  const [activeBatches, setActiveBatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [isAlert, setIsAlert] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoadingBatches(true);
    const { data: fermenting } = await supabase
      .from('batches')
      .select('*, ph_readings(ph_value, is_deviation, deviation_acknowledged)')
      .in('status', ['fermenting', 'deviation', 'qc-hold'])
      .order('start_time', { ascending: false });

    // Check for unacknowledged deviations
    const hasDeviation = fermenting?.some(b => b.ph_readings?.some(ph => ph.is_deviation && !ph.deviation_acknowledged));
    setIsAlert(hasDeviation);
    setActiveBatches(fermenting || []);

    const { data: completed } = await supabase
      .from('batches')
      .select('*')
      .in('status', ['released', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(10);
    
    setHistory(completed || []);
    setLoadingBatches(false);
  };

  if (loading) return null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {isAlert && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center text-red-800">
            <AlertTriangle className="w-6 h-6 mr-3" />
            <span className="font-bold text-lg">CCP DEVIATION ALERT: Unacknowledged pH deviations detected. Immediate review required!</span>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Batch Manager</h1>
          <p className="text-gray-500 mt-1">Track active fermentations and log critical control points (CCPs).</p>
        </div>
        {role === 'admin' && (
          <button className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm shrink-0">
            <Plus className="w-5 h-5 mr-1" /> New Batch
          </button>
        )}
      </div>

      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <FlaskConical className="w-5 h-5 mr-2 text-teal-700" /> Active Fermentations
        </h2>
        {loadingBatches ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-teal-700" /></div>
        ) : activeBatches.length === 0 ? (
          <div className="p-8 text-center bg-white border border-gray-200 rounded-2xl shadow-sm text-gray-500">
            No active batches. Create one to begin tracking fermentation.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeBatches.map(batch => {
               const latestPhList = batch.ph_readings || [];
               const latestPh = latestPhList.length > 0 ? latestPhList[latestPhList.length - 1] : null;
               const hours = differenceInHours(new Date(), new Date(batch.start_time));

               return (
                 <div key={batch.id} className={`bg-white rounded-2xl border ${latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'border-red-400 ring-2 ring-red-400 text-red-900' : 'border-gray-200'} shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md`}>
                   <div className={`px-6 py-4 flex justify-between items-start border-b ${latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'bg-red-50 border-red-100' : 'border-gray-100'}`}>
                     <div>
                       <p className="font-mono text-lg font-bold text-teal-900 tracking-wider mb-1">{batch.batch_id}</p>
                       <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">{batch.variant}</span>
                     </div>
                     <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${batch.status === 'deviation' || (latestPh?.is_deviation) ? 'bg-red-100 text-red-800' : batch.status === 'qc-hold' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'}`}>
                       {batch.status === 'fermenting' && latestPh?.is_deviation ? 'DEVIATION' : batch.status}
                     </span>
                   </div>
                   <div className="px-6 py-5 flex-1 flex justify-between">
                     <div>
                       <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Elapsed Time</p>
                       <p className="text-xl font-semibold text-gray-700">{hours} <span className="text-sm">hrs</span></p>
                     </div>
                     <div className="text-right">
                       <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Latest pH</p>
                       {latestPh ? (
                         <p className={`text-4xl font-black tracking-tighter tabular-nums ${latestPh.is_deviation ? 'text-red-600' : 'text-green-600'}`}>{latestPh.ph_value}</p>
                       ) : (
                         <p className="text-xl font-medium text-gray-300">—</p>
                       )}
                     </div>
                   </div>
                   <Link href={`/batches/${batch.id}`} className={`w-full py-3.5 flex justify-center items-center text-sm font-semibold transition-colors border-t ${latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-50 hover:bg-gray-100 text-teal-800 border-gray-100'}`}>
                     {latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'Review Deviation Now' : 'View Details & Log pH'} <ArrowRight className="w-4 h-4 ml-2" />
                   </Link>
                 </div>
               )
            })}
          </div>
        )}
      </section>

      <section className="pt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Batch History & QC</h2>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch ID</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Variant</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Started</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {history.map((batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-teal-800 tracking-wider">
                      {batch.batch_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">{batch.variant}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2.5 py-1 inline-flex text-xs font-bold uppercase tracking-wider rounded-md ${batch.status === 'released' ? 'bg-green-100 text-green-800' : batch.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                      {format(new Date(batch.start_time), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link href={`/batches/${batch.id}`} className="text-teal-600 hover:text-teal-900 focus:outline-none underline-offset-4 hover:underline">View Report</Link>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && !loadingBatches && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-sm text-gray-500">No completed batches in history.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
