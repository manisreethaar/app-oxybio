'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { notifyEmployee } from '@/lib/notifyEmployee';
import { Clock, Download, ArrowRightCircle, ArrowLeftCircle, CheckCircle2, MapPin, Camera, AlertCircle, X, ShieldCheck, Loader2, BarChart2, TrendingUp } from 'lucide-react';
import Webcam from 'react-webcam';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TARGET_LAT = 12.7409; 
const TARGET_LNG = 77.8253; 
const MAX_RADIUS_METERS = 200;

// Shift window: 9:00 AM – 11:00 AM is on-time. After 11:00 AM = late. Before 7:00 AM = early.
const getShiftStatus = (checkInTime) => {
  if (!checkInTime) return null;
  const h = new Date(checkInTime).getHours();
  const m = new Date(checkInTime).getMinutes();
  const totalMins = h * 60 + m;
  if (totalMins < 7 * 60) return { label: 'Early', color: 'text-sky-700 bg-sky-50 border-sky-200' };
  if (totalMins > 11 * 60) return { label: 'Late', color: 'text-red-700 bg-red-50 border-red-200' };
  return { label: 'On Time', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
};

export default function AttendancePage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [todayLog, setTodayLog] = useState(null);
  const [myHistory, setMyHistory] = useState([]);
  const [teamToday, setTeamToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'analytics'
  
  // Geofence & Webcam States
  const [showWebcam, setShowWebcam] = useState(false);
  const [geoData, setGeoData] = useState(null);
  const [checkInError, setCheckInError] = useState('');
  const [overrideLocation, setOverrideLocation] = useState(false);
  const webcamRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  const supabase = createClient();

  // Pure reactive clock for elapsed calculation (Memory Safe)
  useEffect(() => {
    const itv = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(itv);
  }, []);

  const elapsedHours = useMemo(() => {
    if (!todayLog?.check_in_time || todayLog.check_out_time) return todayLog?.total_hours || '0.0';
    const start = new Date(todayLog.check_in_time).getTime();
    return ((now - start) / (1000 * 60 * 60)).toFixed(1);
  }, [todayLog, now]);

  useEffect(() => {
    if (employeeProfile) fetchAttendanceData();
  }, [employeeProfile]);

  const fetchAttendanceData = async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      if (role !== 'admin') {
        const { data: today } = await supabase.from('attendance_log')
          .select('*')
          .eq('employee_id', employeeProfile.id)
          .eq('date', todayStr)
          .maybeSingle();
        setTodayLog(today || null);

        const { data: history } = await supabase.from('attendance_log')
          .select('*')
          .eq('employee_id', employeeProfile.id)
          .order('date', { ascending: false })
          .range(0, 30);
        setMyHistory(history || []);
      } else {
        const { data: teamLogs } = await supabase.from('attendance_log').select('*, employees(full_name, role)').eq('date', todayStr);
        const { data: allEmps } = await supabase.from('employees').select('id, full_name, role').eq('is_active', true);
        const combined = (allEmps || []).map(emp => ({ ...emp, attendance: (teamLogs || []).find(l => l.employee_id === emp.id) }));
        setTeamToday(combined);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Weekly Summary Chart Data ────────────────────────────────────────────
  const weeklyChartData = useMemo(() => {
    if (!myHistory.length) return [];
    // Group last 7 logged days
    return myHistory.slice(0, 7).reverse().map(log => ({
      date: new Date(log.date).toLocaleDateString([], { weekday: 'short', day: 'numeric' }),
      hours: parseFloat(log.total_hours || 0),
      status: getShiftStatus(log.check_in_time)?.label || 'On Time'
    }));
  }, [myHistory]);

  const weeklyTotalHours = useMemo(() => {
    const lastWeek = myHistory.slice(0, 7);
    return lastWeek.reduce((sum, log) => sum + parseFloat(log.total_hours || 0), 0).toFixed(1);
  }, [myHistory]);

  const lateCount = useMemo(() => myHistory.slice(0, 30).filter(l => getShiftStatus(l.check_in_time)?.label === 'Late').length, [myHistory]);
  const onTimeCount = useMemo(() => myHistory.slice(0, 30).filter(l => getShiftStatus(l.check_in_time)?.label === 'On Time').length, [myHistory]);

  // ─── CSV Export ───────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = 'Date,Check In,Check Out,Total Hours,GPS Verified,Shift Status';
    const rows = myHistory.map(log => [
      log.date,
      log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString() : '--',
      log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString() : '--',
      log.total_hours || '0',
      log.in_geofence ? 'Yes' : 'No',
      getShiftStatus(log.check_in_time)?.label || '--'
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${employeeProfile?.full_name?.replace(' ', '_') || 'report'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const initiateCheckIn = () => {
    if (actionLoading) return; // Concurrency Lock
    setCheckInError('');
    setActionLoading(true);
    if (!navigator.geolocation) {
      setCheckInError("Geolocation is not supported by your browser");
      setActionLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setGeoData({ lat: latitude, lng: longitude, distance: 'calculating...' });
        setShowWebcam(true);
        setActionLoading(false);
      },
      (err) => {
        setCheckInError("Unable to retrieve location. Please enable GPS permissions.");
        setActionLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const captureSelfieAndCheckIn = async () => {
    setActionLoading(true);
    setCheckInError('');
    if (!webcamRef.current) {
      setCheckInError('Camera not ready.');
      setActionLoading(false);
      return;
    }
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
       setCheckInError("Capture failed.");
       setActionLoading(false);
       return;
    }
    
    try {
      const resBlob = await fetch(imageSrc);
      const blob = await resBlob.blob();
      const formData = new FormData();
      formData.append('file', blob, 'selfie.webp');
      
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error("Photo upload failed");

      const checkInRes = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           lat: geoData.lat,
           lng: geoData.lng,
           photo_url: uploadData.url,
           override: overrideLocation
        })
      });

      const checkInData = await checkInRes.json();
      if (!checkInRes.ok) throw new Error(checkInData.error || 'Check-in failed');

      setShowWebcam(false);
      // Notify the employee with a check-in confirmation
      notifyEmployee(
        employeeProfile.id,
        '🟢 Checked In',
        `You have successfully checked in at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST. Have a great shift!`,
        '/attendance'
      );
      fetchAttendanceData();
    } catch (err) {
      setCheckInError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (actionLoading) return; // Concurrency Lock
    setActionLoading(true);
    const { error } = await supabase.from('attendance_log').update({
      check_out_time: new Date().toISOString()
    }).eq('id', todayLog.id);
    if (error) alert('Check-out failed: ' + error.message);
    else {
      // Notify the employee of successful checkout
      notifyEmployee(
        employeeProfile.id,
        '🔴 Checked Out',
        `Shift completed at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST. Great work today!`,
        '/attendance'
      );
      fetchAttendanceData();
    }
    setActionLoading(false);
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

  if (authLoading || loading) return <div className="p-8 text-center text-slate-500">Loading attendance data...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Attendance</h1>
          <p className="text-slate-500 mt-1 font-medium">GPS tracked shift verification.</p>
        </div>
        <div className="flex items-center gap-3">
          {role !== 'admin' && (
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-50 transition-all shadow-sm">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
          {!todayLog && role === 'admin' && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-center justify-between text-xs">
              <span className="text-amber-800 font-bold mr-3"><ShieldCheck className="inline w-4 h-4 mr-1"/> Admin Debug Override</span>
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" checked={overrideLocation} onChange={(e) => setOverrideLocation(e.target.checked)} className="mr-2 rounded text-amber-600"/>
                <span className="font-medium text-amber-700">Skip GPS Block</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Tab Bar — Staff only */}
      {role !== 'admin' && (
        <div className="flex border-b border-slate-200">
          <button onClick={() => setActiveTab('today')} className={`px-6 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'today' ? 'border-teal-600 text-teal-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <Clock className="w-4 h-4" /> Today
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`px-6 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'analytics' ? 'border-teal-600 text-teal-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <BarChart2 className="w-4 h-4" /> Analytics
          </button>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && role !== 'admin' && (
        <div className="space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Hours This Week', value: `${weeklyTotalHours}h`, icon: TrendingUp, color: 'text-teal-600' },
              { label: 'Days Logged (30d)', value: myHistory.length, icon: Clock, color: 'text-slate-600' },
              { label: 'On Time', value: onTimeCount, icon: CheckCircle2, color: 'text-emerald-600' },
              { label: 'Late Arrivals', value: lateCount, icon: AlertCircle, color: 'text-red-500' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <kpi.icon className={`w-5 h-5 mb-3 ${kpi.color}`} />
                <p className="text-3xl font-black text-slate-800">{kpi.value}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-800 mb-6">Daily Hours (Last 7 Shifts)</h2>
            {weeklyChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 font-medium">No history to chart yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyChartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="h" domain={[0, 10]} />
                  <Tooltip formatter={(v) => [`${v}h`, 'Hours']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }} />
                  <Bar dataKey="hours" radius={[8, 8, 0, 0]}>
                    {weeklyChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.status === 'Late' ? '#f87171' : entry.status === 'Early' ? '#38bdf8' : '#0d9488'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex gap-4 mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-600 inline-block"></span> On Time</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block"></span> Late</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-400 inline-block"></span> Early</span>
            </div>
          </div>
        </div>
      )}

      {/* Today Tab (Default) */}
      {(activeTab === 'today' || role === 'admin') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {role !== 'admin' && (
            <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center justify-center text-center min-h-[400px] relative overflow-hidden">
              <h2 className="text-lg font-black text-slate-800 mb-8 absolute top-6 left-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-600" /> Today&apos;s Shift
              </h2>
              
              {!todayLog ? (
                <div className="w-full max-w-xs pt-8">
                  <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-white">
                    <MapPin className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 mb-2">Not Checked In</h3>
                  {checkInError && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-200 flex items-start text-left"><AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5"/>{checkInError}</div>}
                  <button onClick={initiateCheckIn} disabled={actionLoading} className="w-full py-4 bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white rounded-2xl font-black text-lg shadow-lg shadow-teal-500/20 uppercase tracking-widest disabled:opacity-50 active:scale-95 flex items-center justify-center">
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Camera className="w-5 h-5 mr-2" />} Verify &amp; Check In
                  </button>
                </div>
              ) : !todayLog.check_out_time ? (
                <div className="w-full max-w-[280px] pt-8">
                  {/* Shift Status Badge */}
                  {getShiftStatus(todayLog.check_in_time) && (
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border mb-4 ${getShiftStatus(todayLog.check_in_time).color}`}>
                      {getShiftStatus(todayLog.check_in_time).label}
                    </span>
                  )}
                  <div className="w-40 h-40 border-[6px] border-teal-500 rounded-full flex items-center justify-center mx-auto mb-8 relative bg-white shadow-[0_0_40px_rgba(20,184,166,0.2)]">
                    <div className="absolute inset-[-6px] border-[6px] border-teal-200 rounded-full animate-ping opacity-30"></div>
                    <div className="text-center">
                      <p className="text-4xl font-black text-teal-800 mb-0.5 tabular-nums tracking-tighter">{elapsedHours}<span className="text-xl">h</span></p>
                      <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] mt-1">Elapsed</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-8 flex flex-col items-center gap-3">
                    {todayLog.photo_url && <img src={todayLog.photo_url} alt="Selfie" className="w-40 h-40 rounded-2xl object-cover border-2 border-white shadow-lg ring-2 ring-teal-500/20" />}
                    <div className="text-center text-sm font-medium text-slate-500">Checked in at <br/><strong className="text-slate-800 text-lg">{formatTime(todayLog.check_in_time)}</strong></div>
                  </div>
                  <button onClick={handleCheckOut} disabled={actionLoading} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-lg shadow-xl uppercase tracking-widest disabled:opacity-70 active:scale-95 flex items-center justify-center">
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <ArrowLeftCircle className="w-5 h-5 mr-2" />} Check Out
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-[280px] pt-4">
                  <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 border border-emerald-200 shadow-sm"><CheckCircle2 className="w-10 h-10" /></div>
                  <h3 className="text-2xl font-black text-slate-800 mb-2">Shift Completed</h3>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <div><span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Total Hours</span><span className="text-2xl font-black text-slate-800 tabular-nums">{todayLog.total_hours || elapsedHours}h</span></div>
                    <div><span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Check Out</span><span className="text-2xl font-black text-slate-800 tabular-nums">{formatTime(todayLog.check_out_time)}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={`glass-panel rounded-[2rem] p-8 flex flex-col ${role === 'admin' ? 'col-span-2' : ''}`}>
            <h2 className="text-lg font-black text-slate-800 mb-6 font-mono">
              {role === 'admin' ? "Team Today" : "Shift History"}
            </h2>

            {role === 'admin' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teamToday.map(emp => (
                  <div key={emp.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${emp.attendance ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-teal-100 text-teal-800 shrink-0">{emp.full_name?.charAt(0)}</div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{emp.full_name}</p>
                      {emp.attendance ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-emerald-600 font-bold">{formatTime(emp.attendance.check_in_time)} → {formatTime(emp.attendance.check_out_time)}</p>
                          {getShiftStatus(emp.attendance.check_in_time) && (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${getShiftStatus(emp.attendance.check_in_time).color}`}>
                              {getShiftStatus(emp.attendance.check_in_time).label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 font-medium">Not checked in</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                {myHistory.map(log => {
                  const status = getShiftStatus(log.check_in_time);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/50 border border-white hover:bg-white transition-all shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500 border border-slate-200">{log.total_hours || '--'}h</div>
                        <div>
                          <p className="font-bold text-slate-800">{new Date(log.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs font-semibold text-slate-500">{formatTime(log.check_in_time)} &rarr; {formatTime(log.check_out_time)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-col sm:flex-row">
                        {status && <span className={`text-[9px] font-black px-2 py-1 rounded-full border ${status.color}`}>{status.label}</span>}
                        {log.in_geofence && <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded uppercase tracking-wider flex items-center"><MapPin className="w-3 h-3 mr-1"/>GPS ✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showWebcam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-md relative">
            <div className="p-6 text-center border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">Selfie Verification</h3>
              <p className="text-sm text-slate-500 font-medium">GMP Compliance Policy required.</p>
            </div>
            <div className="relative bg-slate-900 aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
              <Webcam audio={false} ref={webcamRef} screenshotFormat="image/webp" videoConstraints={{ facingMode: "user" }} className="w-full h-full object-cover" mirrored={true}/>
              <div className="absolute inset-0 border-[40px] border-slate-900/40 pointer-events-none"></div>
              <div className="absolute inset-0 m-10 border-2 border-white/40 border-dashed rounded-[100%] pointer-events-none"></div>
            </div>
            <div className="p-6 bg-slate-50 flex gap-4">
              <button onClick={() => setShowWebcam(false)} className="flex-1 py-3.5 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200">Cancel</button>
              <button onClick={captureSelfieAndCheckIn} disabled={actionLoading} className="flex-1 py-3.5 bg-teal-800 hover:bg-teal-900 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Check In Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
