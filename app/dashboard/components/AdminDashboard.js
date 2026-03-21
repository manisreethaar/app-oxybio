'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertTriangle, FlaskConical, CalendarOff, CheckSquare, CalendarDays, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { differenceInHours } from 'date-fns';

export default function AdminDashboard({ employeeId }) {
  const [stats, setStats] = useState({ batches: 0, leaves: 0, tasks: 0, compliance: 0 });
  const [alerts, setAlerts] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [teamPresence, setTeamPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    try {
      // Fetch alerts (deviations & overdue)
      const { data: deviations } = await supabase.from('ph_readings').select('batch_id').eq('is_deviation', true).eq('deviation_acknowledged', false);
      const { data: overdues } = await supabase.from('compliance_items').select('id').eq('status', 'overdue');
      
      const newAlerts = [];
      if (deviations?.length > 0) newAlerts.push({ message: `Critical: ${deviations.length} unacknowledged pH deviations!`, type: 'danger', link: '/batches' });
      if (overdues?.length > 0) newAlerts.push({ message: `${overdues.length} compliance items are overdue.`, type: 'warning', link: '/compliance' });
      setAlerts(newAlerts);

      // Fetch active batches
      const { data: batches } = await supabase.from('batches').select(`*, ph_readings(ph_value, is_deviation)`).eq('status', 'fermenting');
      setActiveBatches(batches || []);

      // Fetch leaves pending
      const { data: leaves } = await supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending');
      setPendingLeaves(leaves || []);

      // Fetch stats
      const { data: openTasks } = await supabase.from('tasks').select('id', { count: 'exact' }).eq('status', 'open').eq('priority', 'urgent');
      const { data: compDue } = await supabase.from('compliance_items').select('id', { count: 'exact' }).in('status', ['upcoming', 'in-progress']); 
      
      setStats({
        batches: batches?.length || 0,
        leaves: leaves?.length || 0,
        tasks: openTasks?.length || 0,
        compliance: compDue?.length || 0
      });

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, link }) => (
    <Link href={link} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center hover:shadow-md transition-shadow">
      <div className={`p-4 rounded-xl mr-4 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </Link>
  );

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {alerts.map((alert, i) => (
        <div key={i} className={`p-4 rounded-xl flex items-center justify-between ${alert.type === 'danger' ? 'bg-red-50 text-red-800 border border-red-200 animate-pulse' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 mr-3" />
            <span className="font-semibold">{alert.message}</span>
          </div>
          <Link href={alert.link} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${alert.type === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
            View Action
          </Link>
        </div>
      ))}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Batches" value={stats.batches} icon={FlaskConical} color="bg-teal-100 text-teal-700" link="/batches" />
        <StatCard title="Pending Approvals" value={stats.leaves} icon={CalendarOff} color="bg-blue-100 text-blue-700" link="/leave" />
        <StatCard title="Open Urgent Tasks" value={stats.tasks} icon={CheckSquare} color="bg-red-100 text-red-700" link="/tasks" />
        <StatCard title="Compliance Due" value={stats.compliance} icon={CalendarDays} color="bg-amber-100 text-amber-700" link="/compliance" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Production Panel */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Today&apos;s Production</h2>
            </div>
            <Link href="/batches" className="text-sm font-medium text-teal-600 hover:text-teal-800">View all</Link>
          </div>
          <div className="p-6">
            {activeBatches.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No active fermenting batches.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeBatches.map(batch => {
                  const hoursElapsed = differenceInHours(new Date(), new Date(batch.start_time));
                  const latestPh = batch.ph_readings && batch.ph_readings.length > 0 
                    ? batch.ph_readings[batch.ph_readings.length - 1] 
                    : null;
                  
                  return (
                    <div key={batch.id} className="border border-gray-200 rounded-xl p-4 flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-teal-500"></div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-mono text-xs font-semibold text-teal-800 mb-1">{batch.batch_id}</p>
                          <p className="font-medium text-gray-900">{batch.variant}</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                          {hoursElapsed}h elapsed
                        </span>
                      </div>
                      <div className="flex items-center mt-3 pt-3 border-t border-gray-100">
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">Latest pH</p>
                          {latestPh ? (
                            <p className={`font-bold ${latestPh.is_deviation ? 'text-red-600' : 'text-green-600'}`}>
                              {latestPh.ph_value}
                            </p>
                          ) : (
                            <p className="text-sm font-medium text-gray-400">Not logged</p>
                          )}
                        </div>
                        <Link href={`/batches/${batch.id}`} className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-teal-700 text-sm font-medium rounded-lg border border-gray-200 transition-colors">
                          Log pH
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Phase 0 Tracker */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Phase 0 Tracker</h2>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            <div className="space-y-4 mb-6">
              {[
                { label: 'Formulation R&D (5 variants)', done: true },
                { label: 'Consumer Taste Panel', done: false },
                { label: 'NABL Shelf-Life Testing', done: false },
                { label: 'Patent Provisional Filed', done: false },
                { label: 'FSSAI Application Submitted', done: false },
                { label: 'Hosur Lease Executed', done: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center">
                  <div className={`w-5 h-5 rounded flex items-center justify-center mr-3 ${item.done ? 'bg-teal-600 text-white' : 'border-2 border-gray-300'}`}>
                    {item.done && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <span className={`text-sm ${item.done ? 'text-gray-500 line-through' : 'text-gray-700 font-medium'}`}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-auto">
              <div className="flex justify-between text-xs font-medium text-gray-500 mb-2">
                <span>Overall Progress</span>
                <span>33%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-teal-600 h-2.5 rounded-full" style={{ width: '33%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
