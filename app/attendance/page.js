'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Clock, Download, ArrowRightCircle, ArrowLeftCircle, CheckCircle2, MapPin, Camera, AlertCircle, X, ShieldCheck, BarChart2, TrendingUp, CalendarOff } from 'lucide-react';
import Webcam from 'react-webcam';
import dynamic from 'next/dynamic';
const AttendanceChart = dynamic(() => import('@/components/charts/AttendanceWeeklyChart'), { ssr: false });

const TARGET_LAT = 12.7409;
const TARGET_LNG = 77.8253;
const MAX_RADIUS_METERS = 200;

const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * (Math.PI / 180);  
  const dLon = (lon2 - lon1) * (Math.PI / 180); 
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
};

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
  const [activeTab, setActiveTab] = useState('today');
  const [onLeaveToday, setOnLeaveToday] = useState([]);
  
  const [showWebcam, setShowWebcam] = useState(false);
  const [geoData, setGeoData] = useState(null);
  const [checkInError, setCheckInError] = useState('');
  const [overrideLocation, setOverrideLocation] = useState(false);
  const webcamRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  const supabase = createClient();

  useEffect(() => {
    const itv = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(itv);
  }, []);

  const elapsedHours = useMemo(() => {
    if (!todayLog?.check_in_time) return '0.0';
    if (todayLog.check_out_time) return parseFloat(todayLog.total_hours || 0).toFixed(1);
    const start = new Date(todayLog.check_in_time).getTime();
    return ((now - start) / (1000 * 60 * 60)).toFixed(1);
  }, [todayLog, now]);

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

  useEffect(() => {
    if (employeeProfile) fetchAttendanceData();
    
    const interval = setInterval(() => {
      if (todayLog && !todayLog.check_out_time) {
        setTodayLog({ ...todayLog, current_time: new Date() });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [employeeProfile, todayLog?.id]);

  const fetchAttendanceData = async () => {
    if (!employeeProfile || !employeeProfile.id) return;
    setLoading(true);
    
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Universally fetch personal attendance for the logged-in user
      const { data: today } = await supabase.from('attendance_log')
        .select('*')
        .eq('employee_id', employeeProfile.id)
        .eq('date', todayStr)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setTodayLog(today || null);

      const { data: history } = await supabase.from('attendance_log')
        .select('*')
        .eq('employee_id', employeeProfile.id)
        .order('date', { ascending: false })
        .limit(30);
      
      setMyHistory(history || []);

      // 2. Fetch team roster ONLY if the user is an admin
      if (role === 'admin') {
        const { data: teamLogs } = await supabase.from('attendance_log')
          .select('*, employees(full_name, role)')
          .eq('date', todayStr);
        
        const { data: allEmps } = await supabase.from('employees').select('id, full_name, role').eq('is_active', true);
        
        const combined = allEmps.map(emp => {
          const log = (teamLogs || []).find(l => l.employee_id === emp.id);
          return { ...emp, attendance: log };
        });
        
        setTeamToday(combined);

        const { data: leavesToday } = await supabase.from('leave_applications')
          .select('employee_id')
          .eq('status', 'approved')
          .lte('start_date', todayStr)
          .gte('end_date', todayStr);
        
        setOnLeaveToday((leavesToday || []).map(l => l.employee_id));
      }
    } catch (err) {
      console.error('Attendance fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const initiateCheckIn = () => {
    setCheckInError('');
    setActionLoading(true);

    if (overrideLocation) {
      setGeoData({ lat: TARGET_LAT, lng: TARGET_LNG, in_geofence: true, distance: 0 });
      setShowWebcam(true);
      setActionLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setCheckInError("Geolocation is not supported by your browser");
      setActionLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const distance = getDistanceFromLatLonInM(latitude, longitude, TARGET_LAT, TARGET_LNG);
        
        // If testing override is enabled, bypass the distance check
        if (distance > MAX_RADIUS_METERS && !overrideLocation) {
          setCheckInError(`Check-in blocked: You are ${Math.round(distance)}m away from the facility. Must be within ${MAX_RADIUS_METERS}m.`);
          setActionLoading(false);
        } else {
          setGeoData({ lat: latitude, lng: longitude, in_geofence: distance <= MAX_RADIUS_METERS, distance: Math.round(distance) });
          setShowWebcam(true);
          setActionLoading(false);
        }
      },
      (err) => {
        let msg = "Unable to retrieve location. Please enable GPS permissions for this site.";
        if (err.code === err.TIMEOUT) msg = "GPS request timed out. Please step outside or try again.";
        else if (err.code === err.POSITION_UNAVAILABLE) msg = "Location information is unavailable on this device.";
        else if (err.code === err.PERMISSION_DENIED) msg = "Location access denied. Please enable GPS for OxyOS in your browser settings.";
        setCheckInError(msg);
        setActionLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );
  };

  const captureSelfieAndCheckIn = useCallback(async () => {
    setActionLoading(true);
    setCheckInError('');
    const imageSrc = webcamRef.current.getScreenshot();
    
    if (!imageSrc) {
       setCheckInError("Failed to capture photo. Please check camera permissions.");
       setActionLoading(false);
       return;
    }
    
    try {
      // Convert base64 String (WebP) to Blob for Supabase Storage
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      
      // Upload to Supabase Storage Ephemeral Bucket
      const filename = `${employeeProfile.id}_${Date.now()}.webp`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attendance-proofs')
        .upload(filename, blob, { contentType: 'image/webp' });

      if (uploadError) throw new Error("Photo upload failed: " + uploadError.message);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('attendance-proofs')
        .getPublicUrl(filename);

      // DB Insert with Geo and Photo data
      const todayStr = new Date().toISOString().split('T')[0];
      const { error: dbError } = await supabase.from('attendance_log').insert({
        employee_id: employeeProfile.id,
        date: todayStr,
        check_in_time: new Date().toISOString(),
        location_lat: geoData.lat,
        location_lng: geoData.lng,
        in_geofence: geoData.in_geofence,
        photo_url: publicUrl
      });
      
      if (dbError) throw dbError;

      setShowWebcam(false);
      setOverrideLocation(false); // auto-reset after use
      setCheckInError('');
      fetchAttendanceData();
    } catch (err) {
      setCheckInError(err.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  }, [webcamRef, geoData, employeeProfile]);

  const handleCheckOut = async () => {
    setActionLoading(true);
    setCheckInError('');
    try {
      const { error } = await supabase.from('attendance_log').update({
        check_out_time: new Date().toISOString()
      }).eq('id', todayLog.id);
      if (error) throw error;
      await fetchAttendanceData();
    } catch (err) {
      setCheckInError("Check-out failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
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

  if (loading) return <div className="p-8 text-center text-slate-500">Loading attendance data...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Attendance & Timesheets</h1>
          <p className="text-slate-500 mt-1 font-medium">GPS tracked shift check-ins and history.</p>
        </div>
        
        {!todayLog && role === 'admin' && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-center justify-between text-xs max-w-sm">
            <span className="text-amber-800 font-bold mr-3"><ShieldCheck className="inline w-4 h-4 mr-1"/> Admin Test Mode</span>
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" checked={overrideLocation} onChange={(e) => setOverrideLocation(e.target.checked)} className="mr-2 rounded text-amber-600 focus:ring-amber-500"/>
              <span className="font-medium text-amber-700">Override GPS Block</span>
            </label>
          </div>
        )}
      </div>

      <div className="flex border-b border-slate-200">
        <button onClick={() => setActiveTab('today')} className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'today' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          <Clock className="w-4 h-4" /> Today
        </button>
        <button onClick={() => setActiveTab('analytics')} className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'analytics' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          <BarChart2 className="w-4 h-4" /> Analytics
        </button>
      </div>

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-black text-slate-800">{weeklyTotalHours}h</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">This Week</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center mb-4">
                <Clock className="w-5 h-5 text-slate-600" />
              </div>
              <p className="text-3xl font-black text-slate-800">{myHistory.length}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Logged (30d)</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-black text-slate-800">{onTimeCount}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">On Time</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center mb-4">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-3xl font-black text-slate-800">{lateCount}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Late Arrivals</p>
            </div>
          </div>

          <div className="glass-card rounded-[2rem] p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-6">Daily Hours (Last 7 Shifts)</h3>
            {weeklyChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 font-medium">No history to chart yet.</div>
            ) : (
              <AttendanceChart data={weeklyChartData} />
            )}
            <div className="flex gap-6 mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal-600 inline-block"></span> On Time</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block"></span> Late</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block"></span> Early</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'today' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card rounded-[2rem] p-8 relative overflow-hidden flex flex-col items-center justify-center text-center min-h-[400px]">
            <h2 className="text-lg font-black text-slate-800 mb-8 absolute top-6 left-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600" /> Today&apos;s Shift
            </h2>
            
            {!todayLog ? (
              onLeaveToday.includes(employeeProfile?.id) ? (
                <div className="w-full max-w-xs pt-8 flex flex-col items-center">
                  <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-200">
                    <CalendarOff className="w-8 h-8 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-2">On Approved Leave</h3>
                  <p className="text-xs text-slate-500 font-medium text-center">You have approved leave for today.</p>
                  <span className="mt-4 px-4 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-black rounded-xl uppercase tracking-widest">Leave Day</span>
                </div>
              ) : (
              <div className="w-full max-w-xs relative z-10 pt-8">
                <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-white">
                  <MapPin className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Not Checked In</h3>
                <p className="text-sm text-slate-500 mb-8 font-medium">GPS & Selfie verification required.</p>
                
                {checkInError && (
                  <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-200 flex items-start text-left shadow-sm">
                    <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                    <span>{checkInError}</span>
                  </div>
                )}

                <button 
                  onClick={initiateCheckIn} disabled={actionLoading}
                  className="w-full py-4 bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white rounded-2xl font-black text-lg shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center uppercase tracking-widest disabled:opacity-50 active:scale-95"
                >
                  <Camera className="w-5 h-5 mr-2" /> Verify & Check In
                </button>
              </div>
              )
            ) : !todayLog.check_out_time ? (
              <div className="w-full max-w-[280px] pt-8">
                {getShiftStatus(todayLog.check_in_time) && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border mb-4 ${getShiftStatus(todayLog.check_in_time).color}`}>
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
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-8 flex items-center justify-center gap-3">
                  {todayLog.photo_url && (
                    <img src={todayLog.photo_url} alt="Selfie" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                  )}
                  <div className="text-left text-sm font-medium text-slate-500">
                    Checked in at <br/><strong className="text-slate-800 text-lg">{formatTime(todayLog.check_in_time)}</strong>
                  </div>
                </div>
                <button 
                  onClick={handleCheckOut} disabled={actionLoading}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-900/10 transition-all flex items-center justify-center uppercase tracking-widest disabled:opacity-70 active:scale-95"
                >
                  <ArrowLeftCircle className="w-5 h-5 mr-2" /> Check Out
                </button>
              </div>
            ) : (
              <div className="w-full max-w-[280px] pt-4">
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 border border-emerald-200 shadow-sm">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Shift Completed</h3>
                <p className="text-sm text-slate-500 mb-8 font-medium">Great work today.</p>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Total Hours</span>
                    <span className="text-2xl font-black text-slate-800 tabular-nums">{elapsedHours}h</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Check Out</span>
                    <span className="text-2xl font-black text-slate-800 tabular-nums">{formatTime(todayLog.check_out_time)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* History Card */}
          <div className="glass-panel rounded-[2rem] p-6 lg:p-8 relative flex flex-col">
            <h2 className="text-lg font-black text-slate-800 mb-6">Recent Shifts</h2>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: '400px' }}>
              <div className="space-y-3">
                {myHistory.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-10 font-medium">No check-in history found.</div>
                ) : myHistory.map(log => {
                  const hours = parseFloat(log.total_hours || calculateHours(log.check_in_time, log.check_out_time));
                  return (
                    <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/50 border border-white hover:bg-white/80 transition-all shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-sm ${hours >= 8 ? 'bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200' : hours > 0 ? 'bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                          {hours > 0 ? `${hours.toFixed(1)}h` : 'OFF'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{new Date(log.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs font-semibold text-slate-500 mt-0.5">
                            {formatTime(log.check_in_time)} &rarr; {formatTime(log.check_out_time)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getShiftStatus(log.check_in_time) && (
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${getShiftStatus(log.check_in_time).color}`}>
                            {getShiftStatus(log.check_in_time).label}
                          </span>
                        )}
                        {log.in_geofence && <span className="text-[8px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100 flex items-center"><MapPin className="w-2.5 h-2.5 mr-0.5"/>GPS</span>}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Admin Roster View */}
      {role === 'admin' && (
        <div className="glass-card rounded-[2rem] p-8 relative">
          <div className="flex justify-between items-center mb-8 border-b border-white/40 pb-5">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Team Roster</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">Live view of who is physically on-site.</p>
            </div>
            <button className="hidden sm:flex items-center px-4 py-2.5 text-xs font-black uppercase tracking-widest text-teal-700 bg-teal-50 border border-teal-100 rounded-xl hover:bg-teal-100 transition-colors shadow-sm">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {teamToday.map(emp => {
               const status = emp.attendance 
                  ? (emp.attendance.check_out_time ? 'completed' : 'active') 
                  : 'absent';
               
               return (
                 <div key={emp.id} className="flex p-5 bg-white/60 border border-white hover:bg-white rounded-2xl items-center relative gap-4 transition-all shadow-sm">
                    <div className="relative">
                      {emp.attendance?.photo_url ? (
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-md">
                          <img src={emp.attendance.photo_url} className="w-full h-full object-cover" alt=""/>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 font-black flex items-center justify-center text-lg border-2 border-white shadow-md">
                          {emp.full_name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      {status === 'active' && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-teal-500 border-2 border-white rounded-full animate-pulse"></div>}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{emp.full_name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate mt-0.5">{emp.role}</p>
                      
                      <div className="mt-2.5">
                        {status === 'active' && <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded inline-flex items-center border border-teal-100"><Clock className="w-3 h-3 mr-1"/> IN: {formatTime(emp.attendance.check_in_time)}</span>}
                        {status === 'completed' && <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded inline-flex items-center border border-slate-200">{emp.attendance.total_hours}h completed</span>}
                        {status === 'absent' && <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded inline-flex items-center border border-red-100">Not Signed In</span>}
                      </div>

                      {status !== 'absent' && (
                        <div className="mt-1.5 flex gap-1 items-center">
                          {emp.attendance?.in_geofence 
                            ? <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider flex items-center"><MapPin className="w-2.5 h-2.5 mr-0.5"/> GPS Verified</span>
                            : <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider flex items-center"><AlertCircle className="w-2.5 h-2.5 mr-0.5"/> Manual Override</span>
                          }
                        </div>
                      )}
                    </div>
                 </div>
               )
            })}
          </div>
        </div>
      )}

      {/* Selfie Capture Modal */}
      {showWebcam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-md relative">
            <div className="p-6 text-center border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-800">Liveness Verification</h3>
              <p className="text-sm text-slate-500 font-medium mt-1">Please take a clear photo of your face.</p>
              
              <div className="mt-2 text-[10px] font-bold text-teal-700 bg-teal-50 py-1.5 px-3 rounded-full inline-flex items-center uppercase tracking-wider">
                <MapPin className="w-3 h-3 mr-1" /> GPS Verified ({geoData?.distance}m / 200m)
              </div>
            </div>

            <div className="relative bg-slate-900 aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/webp"
                screenshotQuality={1}
                videoConstraints={{ 
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: "user" 
                }}
                className="w-full h-full object-cover"
                mirrored={true}
              />
              
              {/* Overlay guides */}
              <div className="absolute inset-0 border-[40px] border-slate-900/40 pointer-events-none"></div>
              <div className="absolute inset-0 m-10 border-2 border-white/40 border-dashed rounded-[100%] pointer-events-none"></div>
            </div>

            <div className="p-6 bg-slate-50 flex gap-4">
              <button 
                onClick={() => setShowWebcam(false)} 
                disabled={actionLoading}
                className="flex-1 py-3.5 px-4 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={captureSelfieAndCheckIn} 
                disabled={actionLoading}
                className="flex-1 py-3.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center disabled:opacity-50"
              >
                {actionLoading ? 'Uploading...' : 'Take Photo & Check In'}
              </button>
            </div>
            
            <button onClick={() => setShowWebcam(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 bg-white/80 rounded-full backdrop-blur"><X className="w-5 h-5"/></button>
          </div>
        </div>
      )}
    </div>
  );
}
