'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { notifyEmployee } from '@/lib/notifyEmployee';
import { Clock, Download, ArrowLeftCircle, CheckCircle2, MapPin, Camera, AlertCircle, ShieldCheck, Loader2, BarChart2, TrendingUp } from 'lucide-react';
import Webcam from 'react-webcam';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TARGET_LAT = parseFloat(process.env.NEXT_PUBLIC_TARGET_LAT || '12.7409'); 
const TARGET_LNG = parseFloat(process.env.NEXT_PUBLIC_TARGET_LNG || '77.8253'); 
const MAX_RADIUS_METERS = 200;

// Shift window: 9:00 AM – 11:00 AM is on-time. After 11:00 AM = late. Before 7:00 AM = early.
const getShiftStatus = (checkInTime) => {
  if (!checkInTime) return null;
  const h = new Date(checkInTime).getHours();
  const m = new Date(checkInTime).getMinutes();
  const totalMins = h * 60 + m;
  if (totalMins < 7 * 60) return { label: 'Early', color: 'text-blue-700 bg-blue-50 border-blue-200' };
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
  const [onLeaveToday, setOnLeaveToday] = useState([]); // employee IDs with approved leave today
  
  // Geofence & Webcam States
  const [showWebcam, setShowWebcam] = useState(false);
  const [geoData, setGeoData] = useState(null);
  const [checkInError, setCheckInError] = useState('');
  const [overrideLocation, setOverrideLocation] = useState(false);
  const webcamRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [captureStatus, setCaptureStatus] = useState("Capture");
  const [previewImage, setPreviewImage] = useState(null); // TWO-STEP PREVIEW

  const supabase = useMemo(() => createClient(), []);


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
      const fetchPromises = [
        supabase.from('attendance_log').select('*').eq('employee_id', employeeProfile.id).eq('date', todayStr).maybeSingle(),
        supabase.from('attendance_log').select('*').eq('employee_id', employeeProfile.id).order('date', { ascending: false }).range(0, 30),
        // Always fetch approved leaves covering today (index 2)
        supabase.from('leave_applications').select('employee_id').eq('status', 'approved').lte('start_date', todayStr).gte('end_date', todayStr)
      ];

      if (['admin', 'ceo', 'cto'].includes(role)) {
        fetchPromises.push(
          supabase.from('attendance_log').select('*, employees(full_name, role)').eq('date', todayStr),
          supabase.from('employees').select('id, full_name, role').eq('is_active', true)
        );
      }

      const results = await Promise.all(fetchPromises);

      setTodayLog(results[0].data || null);
      setMyHistory(results[1].data || []);

      // Set who is on approved leave today
      const leaveIds = (results[2].data || []).map(l => l.employee_id);
      setOnLeaveToday(leaveIds);

      if (['admin', 'ceo', 'cto'].includes(role)) {
        const teamLogs = results[3].data || [];
        const allEmps = results[4].data || [];
        const combined = allEmps.map(emp => ({ ...emp, attendance: teamLogs.find(l => l.employee_id === emp.id) }));
        setTeamToday(combined);
      }
    } catch (err) {
      console.error('Attendance fetch error:', err);
    } finally {
      setLoading(false);
    }
  };


  const weeklyChartData = useMemo(() => {
    if (!myHistory.length) return [];
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
    const a = document.createElement('a'); a.href = url;
    a.download = `attendance_${employeeProfile?.full_name?.replace(' ', '_') || 'report'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const fallbackToIPLocation = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error("Fallback provider failed.");
      const data = await res.json();
      if (data.latitude && data.longitude) {
        setGeoData({ lat: data.latitude, lng: data.longitude });
        setPreviewImage(null);
        setShowWebcam(true);
      } else {
        throw new Error("Invalid fallback coordinates.");
      }
    } catch (err) {
      setCheckInError("Total location failure: Hardware GPS blocked AND Network mapping failed. Please enable location services.");
    } finally {
      setActionLoading(false);
    }
  };

  const initiateCheckIn = () => {
    if (actionLoading) return;
    setCheckInError('');
    setActionLoading(true);
    if (!navigator.geolocation) {
      fallbackToIPLocation();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => { setGeoData({ lat: position.coords.latitude, lng: position.coords.longitude }); setPreviewImage(null); setShowWebcam(true); setActionLoading(false); },
      (err) => { 
        console.warn(`Hardware GPS failed (Code ${err.code}). Triggering permanent fallback...`);
        fallbackToIPLocation();
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 } 
    );
  };


  const handleCapturePreview = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) setPreviewImage(imageSrc);
  };

  const submitCheckIn = async () => {
    if (!previewImage) return;
    setActionLoading(true); setCheckInError(''); setCaptureStatus("Encoding...");
    
    try {
      const fetchWithTimeout = (url, options, timeout = 20000) => {
        return Promise.race([
          fetch(url, options),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Network request timed out')), timeout))
        ]);
      };
      // Cross-browser safe: convert data URL to blob via fetch
      if (!previewImage || !previewImage.startsWith('data:')) {
        setCheckInError("Camera screenshot format invalid. Please try again.");
        setActionLoading(false);
        setCaptureStatus("Submit Verification");
        return;
      }
      const blob = await fetch(previewImage).then(r => r.blob());

      const formData = new FormData(); formData.append('file', blob, 'selfie.jpeg');
      
      setCaptureStatus("Uploading...");
      const uploadRes = await fetchWithTimeout('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || `Upload failed: ${uploadRes.status}`);

      setCaptureStatus("Verifying...");
      const checkInRes = await fetchWithTimeout('/api/attendance/check-in', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: geoData.lat, lng: geoData.lng, photo_url: uploadData.url, override: overrideLocation })
      });
      const checkInData = await checkInRes.json();
      if (!checkInRes.ok) throw new Error(checkInData.error || 'Check-in failed');

      setShowWebcam(false);
      notifyEmployee(employeeProfile.id, '🟢 Checked In', `Successful check-in at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST.`, '/attendance');
      fetchAttendanceData();
    } catch (err) { 
      setCheckInError(err.message); 
      console.error(err);
    } finally { 
      setActionLoading(false); 
      setCaptureStatus("Submit Verification");
    }
  };

  const handleCheckOut = async () => {
    if (actionLoading) return;
    setActionLoading(true);

    const performCheckout = async (lat, lng) => {
      try {
        const res = await fetch('/api/attendance/check-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: todayLog.id, lat, lng })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Check-out failed');

        notifyEmployee(employeeProfile.id, '🔴 Checked Out', `Shift completed at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST.`, '/attendance');
        fetchAttendanceData();
      } catch (err) {
        alert('Check-out failed: ' + err.message);
      } finally {
        setActionLoading(false);
      }
    };

    // If already has geoData from a previous check-in session in the same lifecycle
    // If already has geoData from a previous check-in session in the same lifecycle
    if (geoData?.lat && geoData?.lng) {
        await performCheckout(geoData.lat, geoData.lng);
        return;
    }

    try {
      if (!navigator.geolocation) {
         await performCheckout(); // Fallback for execs
         return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await performCheckout(position.coords.latitude, position.coords.longitude);
        },
        async (err) => {
          console.warn("Check-out location acquisition failed, attempting bypass...");
          await performCheckout();
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    } catch (err) {
      console.error(err);
      setActionLoading(false);
    }
  };


  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

  if (authLoading || loading) return <div className="p-8 text-center text-gray-400 font-medium">Loading attendance deck...</div>;

  return (
    <div className="page-container">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance Tracking</h1>
          <p className="text-sm text-gray-500 mt-1">Nodal verification and logged cycles.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 font-semibold text-xs rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          {!todayLog && ['admin', 'ceo', 'cto'].includes(role) && (
            <div className="bg-amber-50 rounded-lg p-2 border border-amber-200 flex items-center justify-between text-xs">
              <span className="text-amber-800 font-semibold mr-2 flex items-center"><ShieldCheck className="w-3.5 h-3.5 mr-1"/> Override</span>
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" checked={overrideLocation} onChange={(e) => setOverrideLocation(e.target.checked)} className="mr-1 rounded text-amber-600 focus:ring-amber-500"/>
                <span className="font-bold text-amber-700">Skip GPS</span>
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('today')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'today' ? 'border-navy text-navy' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          <Clock className="w-3.5 h-3.5" /> Today
        </button>
        <button onClick={() => setActiveTab('analytics')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'analytics' ? 'border-navy text-navy' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          <BarChart2 className="w-3.5 h-3.5" /> Analytics
        </button>
      </div>

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'This Week', value: `${weeklyTotalHours}h`, icon: TrendingUp, color: 'text-navy background: bg-blue-50' },
              { label: 'Logged (30d)', value: myHistory.length, icon: Clock, color: 'text-gray-600 bg-gray-50' },
              { label: 'On Time', value: onTimeCount, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Late Arrivals', value: lateCount, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
            ].map(kpi => (
              <div key={kpi.label} className="surface p-5">
                <div className={`p-2 rounded-lg w-fit mb-3 ${kpi.color.split(' ')[1]}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color.split(' ')[0]}`} />
                </div>
                <p className="text-2xl font-black text-gray-900">{kpi.value}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="surface p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-6">Daily Hours (Last 7 Shifts)</h2>
            {weeklyChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 font-medium text-sm">No history to chart yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyChartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 600, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} unit="h" domain={[0, 10]} />
                  <Tooltip formatter={(v) => [`${v}h`, 'Hours']} contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                    {weeklyChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.status === 'Late' ? '#EF4444' : entry.status === 'Early' ? '#3B82F6' : '#1F3A5F'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex gap-4 mt-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-navy inline-block"></span> On Time</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"></span> Late</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block"></span> Early</span>
            </div>
          </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Main Check-In/Out Interface */}
          <div className="surface p-8 flex flex-col items-center justify-center text-center min-h-[380px] relative">

              <h2 className="text-sm font-bold text-gray-900 mb-8 absolute top-6 left-6 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-navy" /> Today&apos;s Shift
              </h2>
              
              {!todayLog ? (
                // Check if employee is on approved leave today
                onLeaveToday.includes(employeeProfile?.id) ? (
                  <div className="w-full max-w-xs pt-8 flex flex-col items-center">
                    <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-200 shadow-sm">
                      <CalendarOff className="w-8 h-8 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">On Approved Leave</h3>
                    <p className="text-xs text-gray-500 font-medium text-center">You have an approved leave for today. No check-in required.</p>
                    <span className="mt-4 px-4 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-black rounded-xl uppercase tracking-widest">Leave Day</span>
                  </div>
                ) : (
                <div className="w-full max-w-xs pt-8">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-200 shadow-inner">
                    <MapPin className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Not Checked In</h3>
                  <div className="flex items-center justify-center gap-1.5 mb-4 p-1.5 bg-gray-50 rounded-full border border-gray-100">
                     <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                     <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active Geofence: 250m</span>
                  </div>
                  {checkInError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs font-semibold border border-red-100 flex items-start text-left"><AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5"/>{checkInError}</div>}
                  <button onClick={initiateCheckIn} disabled={actionLoading} className="w-full py-3 bg-navy hover:bg-navy-hover text-white rounded-lg font-bold text-sm shadow-sm uppercase tracking-wider disabled:opacity-50 active:scale-95 flex items-center justify-center">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5"/> : <Camera className="w-4 h-4 mr-1.5" />} Check In
                  </button>
                </div>
                ) /* end: not on leave */
              ) : !todayLog.check_out_time ? (
                <div className="w-full max-w-[260px] pt-8">
                  {getShiftStatus(todayLog.check_in_time) && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border mb-4 ${getShiftStatus(todayLog.check_in_time).color}`}>
                      {getShiftStatus(todayLog.check_in_time).label}
                    </span>
                  )}
                  <div className="w-36 h-36 border-4 border-navy rounded-full flex items-center justify-center mx-auto mb-6 relative bg-white shadow-sm">
                    <div className="absolute inset-[-4px] border-4 border-navy/20 rounded-full animate-ping opacity-30"></div>
                    <div className="text-center">
                      <p className="text-3xl font-black text-navy mb-0.5 tabular-nums tracking-tighter">{elapsedHours}<span className="text-lg">H</span></p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Elapsed</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6 flex flex-col items-center gap-3">
                    {todayLog.photo_url && <img src={todayLog.photo_url} alt="Selfie" className="w-32 h-32 rounded-xl object-cover border border-gray-200 shadow-sm" />}
                    <div className="text-center text-xs font-semibold text-gray-500">Checked in at <br/><strong className="text-gray-900 text-base">{formatTime(todayLog.check_in_time)}</strong></div>
                  </div>
                  <button onClick={handleCheckOut} disabled={actionLoading} className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-bold text-sm shadow-sm uppercase tracking-wider disabled:opacity-70 active:scale-95 flex items-center justify-center">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5"/> : <ArrowLeftCircle className="w-4 h-4 mr-1.5" />} Check Out
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-[260px] pt-4">
                  <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 border border-emerald-100 shadow-sm"><CheckCircle2 className="w-8 h-8" /></div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Shift Completed</h3>
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Hours</span><span className="text-xl font-bold text-gray-900 tabular-nums">{todayLog.total_hours || elapsedHours}H</span></div>
                    <div><span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Check Out</span><span className="text-xl font-bold text-gray-900 tabular-nums">{formatTime(todayLog.check_out_time)}</span></div>
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'today' ? (
            <div className="surface p-6 flex flex-col h-full">
              <h2 className="text-sm font-bold text-gray-900 mb-4 tracking-tight">
              {role === 'admin' ? "Team Presence Today" : "Recent Shift History"}
            </h2>

            {role === 'admin' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {teamToday.map(emp => (
                  <div key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    emp.attendance
                      ? 'bg-emerald-50/30 border-emerald-200'
                      : onLeaveToday.includes(emp.id)
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-white border-gray-200'
                  }`}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs bg-navy/10 text-navy shrink-0">{emp.full_name?.charAt(0)}</div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-xs truncate">{emp.full_name}</p>
                      {emp.attendance ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[10px] text-emerald-600 font-bold">{formatTime(emp.attendance.check_in_time)}</p>
                          {getShiftStatus(emp.attendance.check_in_time) && (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${getShiftStatus(emp.attendance.check_in_time).color}`}>
                              {getShiftStatus(emp.attendance.check_in_time).label}
                            </span>
                          )}
                        </div>
                      ) : onLeaveToday.includes(emp.id) ? (
                        <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                          <CalendarOff className="w-3 h-3" /> On Approved Leave
                        </p>
                      ) : (
                        <p className="text-[10px] text-gray-400 font-medium">Away</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[340px] pr-2">
                {myHistory.map(log => {
                  const status = getShiftStatus(log.check_in_time);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-[11px] font-bold text-gray-500 border border-gray-100">{log.total_hours || '--'}H</div>
                        <div>
                          <p className="font-bold text-xs text-gray-800">{new Date(log.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          <p className="text-[10px] font-medium text-gray-500">{formatTime(log.check_in_time)} &rarr; {formatTime(log.check_out_time)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {status && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${status.color}`}>{status.label}</span>}
                        {log.in_geofence && <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-wider flex items-center"><MapPin className="w-2 h-2 mr-0.5"/>GPS</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            ) : (
              <div className="surface p-6 h-full">
                 {/* Analytics or History moved here when tab changes if needed, but keeping original structure for now */}
                 <p className="text-sm text-gray-500">History and analytics active in secondary tab views.</p>
              </div>
            )}
          </div>
        </div>



      {showWebcam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm relative">
            <div className="p-5 text-center border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 tracking-tight">Selfie Verification</h3>
              <p className="text-xs text-gray-500 mt-0.5">Secure GMP Compliance protocols active.</p>
            </div>
            <div className="relative bg-black aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
              {previewImage ? (
                <img src={previewImage} alt="Preview" className="w-full h-full object-cover mirrored-img" style={{ transform: 'scaleX(-1)' }} />
              ) : (
                <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: "user" }} className="w-full h-full object-cover" mirrored={true}/>
              )}
              <div className="absolute inset-0 border-[32px] border-black/40 pointer-events-none"></div>
              <div className="absolute inset-0 m-8 border border-white/40 border-dashed rounded-[100%] pointer-events-none"></div>
            </div>
            {checkInError && (
              <div className="px-5 py-3 bg-red-50 text-red-700 text-xs font-bold border-b border-red-100 flex items-start text-left">
                <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                {checkInError}
              </div>
            )}
            <div className="p-4 bg-gray-50 flex gap-3">
              {previewImage ? (
                <>
                  <button onClick={() => setPreviewImage(null)} disabled={actionLoading} className="flex-1 py-2.5 bg-white text-gray-600 font-semibold rounded-lg border border-gray-200 text-sm disabled:opacity-50">Retake</button>
                  <button onClick={submitCheckIn} disabled={actionLoading} className="flex-1 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg shadow-sm flex items-center justify-center disabled:opacity-50 text-sm">
                    {captureStatus === 'Capture' ? 'Submit' : captureStatus}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowWebcam(false)} className="flex-1 py-2.5 bg-white text-gray-600 font-semibold rounded-lg border border-gray-200 text-sm">Cancel</button>
                  <button onClick={handleCapturePreview} className="flex-1 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg shadow-sm flex items-center justify-center text-sm">
                    Capture
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
