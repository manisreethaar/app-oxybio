'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer } from 'recharts';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, Loader2, Save } from 'lucide-react';
import Link from 'next/link';

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [batch, setBatch] = useState(null);
  const [phValue, setPhValue] = useState('');
  const [notes, setNotes] = useState('');
  const [deviationNotes, setDeviationNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (batchId) fetchBatchDetail();
  }, [batchId]);

  const fetchBatchDetail = async () => {
    const { data: b, error } = await supabase
      .from('batches')
      .select('*, ph_readings(*, employees(full_name)), activity_log(*)')
      .eq('id', batchId)
      .single();

    if (b) {
      if (b.ph_readings) {
        b.ph_readings.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      }
      setBatch(b);
    }
  };

  const handleLogPh = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch('/api/ph/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId, ph_value: parseFloat(phValue), notes })
      });
      
      if (res.ok) {
        setPhValue('');
        setNotes('');
        await fetchBatchDetail();
      } else {
        alert('Failed to log pH. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const acknowledgeDeviation = async (phId) => {
    if (!deviationNotes.trim()) {
      alert('Action taken is required to acknowledge a deviation.');
      return;
    }
    setActionLoading(true);
    const res = await fetch(`/api/ph/${phId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_taken: deviationNotes })
    });
    
    if (res.ok) {
      setDeviationNotes('');
      await fetchBatchDetail();
    }
    setActionLoading(false);
  };

  const updateBatchStatus = async (newStatus) => {
    if (!confirm(`Are you sure you want to change the status to ${newStatus.toUpperCase()}?`)) return;
    setActionLoading(true);
    
    // Simplification for the UI. Instead of creating a new API route, update directly via Supabase if admin.
    // In production we might use a dedicated API for strict security.
    const updateData = { status: newStatus };
    if (newStatus === 'released') {
      updateData.released_by = employeeProfile.id;
      updateData.released_at = new Date().toISOString();
    }

    await supabase.from('batches').update(updateData).eq('id', batchId);
    
    await fetchBatchDetail();
    setActionLoading(false);
  };

  if (authLoading || !batch) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-teal-800" />
      </div>
    );
  }

  const unacknowledgedDeviations = batch.ph_readings?.filter(p => p.is_deviation && !p.deviation_acknowledged) || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <Link href="/batches" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-teal-700 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Batch Manager
      </Link>

      {/* Hero Section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <div className="p-8 md:w-2/3">
          <div className="flex items-center justify-between mb-2">
            <span className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-800 border border-gray-200">{batch.variant}</span>
            <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${batch.status === 'fermenting' ? 'bg-amber-100 text-amber-800' : batch.status === 'released' ? 'bg-green-100 text-green-800' : batch.status === 'deviation' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
              {batch.status}
            </span>
          </div>
          <h1 className="text-3xl font-black text-teal-950 font-mono tracking-wider mb-4">{batch.batch_id}</h1>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Volume</p>
              <p className="font-semibold text-gray-900">{batch.volume_litres} L</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Strain</p>
              <p className="font-semibold text-gray-900">{batch.probiotic_strain}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Started At</p>
              <p className="font-semibold text-gray-900">{new Date(batch.start_time).toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        {/* Admin Controls Area */}
        {role === 'admin' && batch.status !== 'released' && batch.status !== 'rejected' && (
          <div className="p-8 flex flex-col justify-center bg-gray-50 md:w-1/3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Batch Actions</h3>
            <div className="space-y-3">
              <button onClick={() => updateBatchStatus('released')} disabled={actionLoading || unacknowledgedDeviations.length > 0} className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50">
                <CheckCircle className="w-4 h-4 mr-2" /> Release Batch
              </button>
              <button onClick={() => updateBatchStatus('qc-hold')} disabled={actionLoading} className="w-full py-2 px-4 border border-amber-300 rounded-lg shadow-sm text-sm font-medium text-amber-800 bg-amber-50 hover:bg-amber-100">
                Move to QC Hold
              </button>
              <button onClick={() => updateBatchStatus('rejected')} disabled={actionLoading} className="w-full py-2 px-4 border border-red-300 rounded-lg shadow-sm text-sm font-medium text-red-800 bg-red-50 hover:bg-red-100">
                Reject Batch
              </button>
            </div>
          </div>
        )}
      </div>

      {unacknowledgedDeviations.map(ph => (
        <div key={ph.id} className="bg-red-50 border border-red-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-4 mt-0.5. shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-800 mb-1">Unacknowledged CCP Deviation</h3>
              <p className="text-sm text-red-700 mb-4">pH of <span className="font-bold">{ph.ph_value}</span> recorded at {new Date(ph.created_at).toLocaleTimeString()} ({ph.time_elapsed_hours?.toFixed(1)} hrs in) violates the acceptable range of 4.2 to 4.5.</p>
              
              {role === 'admin' && (
                <div className="bg-white rounded-xl p-4 border border-red-200">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Deviation Review & Corrective Action required:</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="text" value={deviationNotes} onChange={(e) => setDeviationNotes(e.target.value)} placeholder="Action taken (e.g., Extended fermentation, Adjusted temp)" className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm" />
                    <button onClick={() => acknowledgeDeviation(ph.id)} disabled={actionLoading} className="px-6 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-70 whitespace-nowrap">
                      Acknowledge & Sign
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Chart Section */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 w-full">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Fermentation pH Profile</h2>
            <div className="h-80 w-full ml-[-20px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={batch.ph_readings || []} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="time_elapsed_hours" 
                    type="number"
                    domain={[0, 'auto']}
                    name="Hours"
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    label={{ value: 'Hours Elapsed', position: 'bottom', fill: '#4B5563', fontSize: 13, dy: 10 }}
                  />
                  <YAxis 
                    domain={[3.5, 6.0]} 
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    label={{ value: 'pH Value', angle: -90, position: 'insideLeft', fill: '#4B5563', fontSize: 13 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val) => [val, 'pH']}
                    labelFormatter={(val) => `Hour ${val.toFixed(1)}`}
                  />
                  
                  {/* Danger zones */}
                  <ReferenceArea y1={3.5} y2={4.2} fill="#FEE2E2" fillOpacity={0.4} />
                  <ReferenceArea y1={4.5} y2={6.0} fill="#FEE2E2" fillOpacity={0.4} />
                  
                  {/* Safe zone lines */}
                  <ReferenceLine y={4.2} stroke="#DC2626" strokeDasharray="3 3" opacity={0.6} />
                  <ReferenceLine y={4.5} stroke="#DC2626" strokeDasharray="3 3" opacity={0.6} />

                  <Line 
                    type="monotone" 
                    dataKey="ph_value" 
                    stroke="#0F766E" 
                    strokeWidth={3}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      return payload.is_deviation ? (
                        <circle cx={cx} cy={cy} r={6} fill="#DC2626" stroke="#FFFFFF" strokeWidth={2} />
                      ) : (
                        <circle cx={cx} cy={cy} r={5} fill="#0F766E" stroke="#FFFFFF" strokeWidth={2} />
                      );
                    }}
                    activeDot={{ r: 7, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* pH Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">pH Read Log</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-200 hidden sm:table">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">pH Value</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Operator</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batch.ph_readings?.map((ph) => (
                  <tr key={ph.id} className={ph.is_deviation ? 'bg-red-50/30' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div>{new Date(ph.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Hr {ph.time_elapsed_hours?.toFixed(1)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-lg font-bold ${ph.is_deviation ? 'text-red-700' : 'text-gray-900'}`}>{ph.ph_value}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {ph.employees?.full_name || 'System'}
                      {ph.notes && <div className="text-xs text-gray-400 mt-0.5 italic max-w-xs truncate">{ph.notes}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {ph.is_deviation ? (
                        ph.deviation_acknowledged ? (
                          <span className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-100 rounded-md">ACKNOWLEDGED</span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-bold text-red-800 bg-red-100 rounded-md">UNRESOLVED DEVIATION</span>
                        )
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-bold text-green-800 bg-green-100 rounded-md">NORMAL</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Sidebar */}
        <div className="space-y-6">
          {/* Record pH Form */}
          {(batch.status === 'fermenting' || batch.status === 'deviation') && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-teal-50">
                <h2 className="text-lg font-bold text-teal-950 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-teal-700" /> Log Checkpoint
                </h2>
              </div>
              <form onSubmit={handleLogPh} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">pH Value *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.00"
                    max="14.00"
                    required
                    value={phValue}
                    onChange={(e) => setPhValue(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-2xl font-bold font-mono tracking-widest text-center shadow-inner"
                    placeholder="4.35"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">Acceptable range: 4.20 - 4.50</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Observation Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    rows="2"
                    placeholder="Optional appearance/odor notes"
                    disabled={isSubmitting}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !phValue}
                  className="w-full flex justify-center items-center py-3 px-4 rounded-xl shadow-md shadow-teal-900/10 text-sm font-bold text-white bg-teal-800 hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-70 transition-all mt-2"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Record Data</>}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
