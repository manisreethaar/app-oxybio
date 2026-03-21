'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Clock, Download, ArrowRightCircle, ArrowLeftCircle, CheckCircle2 } from 'lucide-react';

export default function AttendancePage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [todayLog, setTodayLog] = useState(null);
  const [myHistory, setMyHistory] = useState([]);
  const [teamToday, setTeamToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) fetchAttendanceData();
    
    // Set up auto-refresh for live counter
    const interval = setInterval(() => {
      if (todayLog && !todayLog.check_out_time) {
        setTodayLog({ ...todayLog, current_time: new Date() }); // Force re-render for live hours
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [employeeProfile, todayLog?.id]);

  const fetchAttendanceData = async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];

    if (role !== 'admin') {
      // Fetch my today's log
      const { data: today } = await supabase.from('attendance_log')
        .select('*')
        .eq('employee_id', employeeProfile.id)
        .eq('date', todayStr)
        .single();
      
      setTodayLog(today || null);

      // Fetch my history
      const { data: history } = await supabase.from('attendance_log')
        .select('*')
        .eq('employee_id', employeeProfile.id)
        .order('date', { ascending: false })
        .limit(30);
      
      setMyHistory(history || []);
    } else {
      // Admin: Fetch all team today
      const { data: teamLogs } = await supabase.from('attendance_log')
        .select('*, employees(full_name, role)')
        .eq('date', todayStr);
      
      const { data: allEmps } = await supabase.from('employees').select('id, full_name, role').eq('is_active', true);
      
      const combined = allEmps.map(emp => {
        const log = (teamLogs || []).find(l => l.employee_id === emp.id);
        return { ...emp, attendance: log };
      });
      
      setTeamToday(combined);
    }
    setLoading(false);
  };

  const handleCheckIn = async () => {
    setActionLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('attendance_log').insert({
      employee_id: employeeProfile.id,
      date: todayStr,
      check_in_time: new Date().toISOString()
    });
    
    if (!error) fetchAttendanceData();
    setActionLoading(false);
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    const { error } = await supabase.from('attendance_log').update({
      check_out_time: new Date().toISOString()
    }).eq('id', todayLog.id);
    
    if (!error) fetchAttendanceData();
    setActionLoading(false);
  };

  const formatTime = (ts) => {
    if (!ts) return '--:--';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateHours = (inTime, outTime) => {
    if (!inTime) return 0;
    const end = outTime ? new Date(outTime) : new Date();
    const start = new Date(inTime);
    return ((end - start) / (1000 * 60 * 60)).toFixed(1);
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading attendance...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Attendance & Time Tracking</h1>
        <p className="text-gray-500 mt-1">Manage shift check-ins and review time logs.</p>
      </div>

      {role !== 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Action Card */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-lg relative overflow-hidden flex flex-col items-center justify-center text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-8 absolute top-6 left-6">Today&apos;s Shift</h2>
            
            {!todayLog ? (
              <div className="w-full max-w-[280px]">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-2">Not Checked In</h3>
                <p className="text-sm text-gray-500 mb-8">Ready to begin your shift at OxyBio?</p>
                <button 
                  onClick={handleCheckIn} disabled={actionLoading}
                  className="w-full py-4 bg-teal-800 hover:bg-teal-900 text-white rounded-2xl font-bold text-lg shadow-xl shadow-teal-900/20 transition-all flex items-center justify-center uppercase tracking-widest disabled:opacity-70"
                >
                  <ArrowRightCircle className="w-6 h-6 mr-2" /> Check In Now
                </button>
              </div>
            ) : !todayLog.check_out_time ? (
              <div className="w-full max-w-[280px]">
                <div className="w-32 h-32 border-4 border-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                  <div className="absolute inset-0 border-4 border-teal-200 rounded-full animate-ping opacity-20"></div>
                  <div className="text-center">
                    <p className="text-3xl font-black text-teal-900 mb-0.5 tabular-nums">{calculateHours(todayLog.check_in_time, null)}<span className="text-lg">h</span></p>
                    <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">Elapsed</p>
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-600 mb-8 bg-gray-50 py-2 rounded-lg border border-gray-100">
                  Checked in at <strong>{formatTime(todayLog.check_in_time)}</strong>
                </p>
                <button 
                  onClick={handleCheckOut} disabled={actionLoading}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-red-900/20 transition-all flex items-center justify-center uppercase tracking-widest disabled:opacity-70"
                >
                  <ArrowLeftCircle className="w-6 h-6 mr-2" /> Check Out
                </button>
              </div>
            ) : (
              <div className="w-full max-w-[280px]">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-2">Shift Completed</h3>
                <p className="text-sm text-gray-500 mb-6">Great job today! You&apos;re checked out.</p>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Hours</span>
                    <span className="text-xl font-bold text-gray-900">{todayLog.total_hours || calculateHours(todayLog.check_in_time, todayLog.check_out_time)}h</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Check Out</span>
                    <span className="text-xl font-bold text-gray-900">{formatTime(todayLog.check_out_time)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-4">My History (Last 30 Days)</h2>
            <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
              <div className="space-y-3">
                {myHistory.map(log => {
                  const hours = parseFloat(log.total_hours || 0);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${hours >= 8 ? 'bg-green-100 text-green-700' : hours > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {hours > 0 ? `${hours.toFixed(1)}h` : 'OFF'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{new Date(log.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs font-medium text-gray-500">
                            {formatTime(log.check_in_time)} &rarr; {formatTime(log.check_out_time)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {role === 'admin' && (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
            <h2 className="text-xl font-bold text-gray-900">Today&apos;s Team Roster</h2>
            <button className="flex items-center px-4 py-2 text-sm font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100">
              <Download className="w-4 h-4 mr-2" /> Export Monthly CSV
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamToday.map(emp => {
               const status = emp.attendance 
                  ? (emp.attendance.check_out_time ? 'completed' : 'active') 
                  : 'absent';
               
               return (
                 <div key={emp.id} className="flex p-4 border border-gray-100 rounded-2xl items-center relative overflow-hidden hover:bg-gray-50">
                    <div className={`absolute left-0 top-0 w-1.5 h-full ${status === 'active' ? 'bg-teal-500' : status === 'completed' ? 'bg-gray-300' : 'bg-red-400'}`}></div>
                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-lg mr-4 shrink-0">
                      {emp.full_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{emp.full_name}</p>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest truncate">{emp.role}</p>
                      <div className="mt-2 text-xs font-medium flex items-center">
                        {status === 'active' && <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 shadow-sm tabular-nums">IN: {formatTime(emp.attendance.check_in_time)}</span>}
                        {status === 'completed' && <span className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 shadow-sm tabular-nums">{emp.attendance.total_hours}h total</span>}
                        {status === 'absent' && <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100 shadow-sm">Not Signed In</span>}
                      </div>
                    </div>
                 </div>
               )
            })}
          </div>
        </div>
      )}
    </div>
  );
}
