'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { 
  User, Phone, MapPin, Calendar, Droplets, AlertCircle, 
  Mail, Briefcase, Hash, LogOut, Upload, Edit3, Save, X, 
  CreditCard, ArrowLeft, ShieldCheck, CheckSquare, Lock, Loader2, ArrowLeftCircle
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

function DigitalIDCard({ emp }) {
  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-2xl w-full max-w-[340px] mx-auto border border-slate-200 flex flex-col items-center relative overflow-hidden">
      {/* Subtle modern background gradient */}
      <div className="absolute top-0 left-0 w-full h-36 bg-gradient-to-br from-teal-800 to-cyan-900"/>
      
      {/* Header */}
      <div className="w-full relative z-10 flex justify-between items-start mb-8">
        <div>
          <h3 className="text-white font-black tracking-widest text-sm uppercase">OXYGEN</h3>
          <p className="text-teal-100 font-bold tracking-widest text-[9px] uppercase">Bioinnovations</p>
        </div>
        <div className={`px-2 py-1 backdrop-blur-sm rounded flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border ${
          emp.is_active 
            ? 'bg-white/20 text-white border-white/30' 
            : 'bg-red-500/40 text-white border-red-300/50'
        }`}>
          <CheckSquare className="w-3 h-3"/> {emp.is_active ? 'Active' : 'Inactive'}
        </div>
      </div>

      {/* Profile Core */}
      <div className="relative z-10 w-28 h-28 rounded-2xl overflow-hidden bg-white border-[3px] border-white shadow-lg mb-4">
        {emp.photo_url ? (
          <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-100">
            <User className="w-10 h-10 text-slate-300"/>
          </div>
        )}
      </div>

      <h2 className="text-xl font-black text-slate-800 tracking-tight text-center leading-none mt-2">{emp.full_name}</h2>
      <p className="text-xs font-bold text-teal-700 tracking-widest uppercase mt-2 mb-6 text-center">{emp.designation || emp.role}</p>
      
      <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center mb-2 shadow-inner">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Official Employee Code</p>
        <p className="font-mono text-2xl font-black text-slate-800 tracking-widest">{emp.employee_code || 'PENDING'}</p>
      </div>

      {/* QR Code Section */}
      <div className="w-full mt-4 pt-5 border-t border-slate-100 flex items-center justify-between">
        <div className="text-left pr-4">
          <p className="text-[9px] font-black text-teal-700 uppercase tracking-widest mb-1.5 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Global Audit Tag</p>
          <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
            Scan to securely verify identity & log compliance checkpoint access.
          </p>
        </div>
        <div className="p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm shrink-0 hover:scale-105 transition-transform origin-bottom-right">
          <QRCodeSVG 
            value={`${typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'https://app.oxygenbioinnovations.com')}/verify/${emp.verification_token || emp.id}`}
            size={64} 
            level="M" 
          />
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const adminViewId = searchParams.get('id');
  const isAdminView = searchParams.get('adminView') === 'true';

  const { employeeProfile, loading: authLoading, role, signOut } = useAuth();
  const toast = useToast();
  const [emp, setEmp] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [view, setView] = useState('info'); // 'info' | 'card'

  const supabase = useMemo(() => createClient(), []);


  const { register, handleSubmit, reset } = useForm({
    resolver: zodResolver(z.object({
      full_name: z.string().min(1, "Name is required"),
      employee_code: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      designation: z.string().optional().nullable(),
      date_of_birth: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      blood_group: z.string().optional().nullable(),
      emergency_contact_name: z.string().optional().nullable(),
      emergency_contact: z.string().optional().nullable(),
      joined_date: z.string().optional().nullable(),
      base_salary: z.coerce.number().optional().nullable()
    }))
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const fetchProfile = async () => {
      // 1. If not admin view, just use the logged in user
      if (!isAdminView || !adminViewId) {
        if (employeeProfile) {
          populateForm(employeeProfile);
        }
        return;
      }

      // 2. Admin View: Fetch specific user
      setFetching(true);
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', adminViewId)
          .single();
        
        if (error) throw error;
        populateForm(data);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setFetching(false);
      }
    };

    const populateForm = (profileData) => {
      setEmp(profileData);
      reset({
        full_name: profileData.full_name || '',
        employee_code: profileData.employee_code || '',
        phone: profileData.phone || '',
        designation: profileData.designation || '',
        date_of_birth: profileData.date_of_birth ? new Date(profileData.date_of_birth).toISOString().split('T')[0] : '',
        address: profileData.address || '',
        blood_group: profileData.blood_group || '',
        emergency_contact_name: profileData.emergency_contact_name || '',
        emergency_contact: profileData.emergency_contact || '',
        joined_date: profileData.joined_date ? new Date(profileData.joined_date).toISOString().split('T')[0] : '',
        base_salary: profileData.base_salary || 0
      });
    };

    fetchProfile();
  }, [employeeProfile, adminViewId, isAdminView, reset, supabase]);

  const handleSaveSubmit = async (data) => {
    setSaving(true);
    const fetchWithTimeout = (url, options, timeout = 20000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network request timed out')), timeout))
      ]);
    };

    try {
      const payload = { ...data, id: emp.id }; // Explicitly use the displayed user's ID
      const res = await fetchWithTimeout('/api/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      
      // Ensure local state matches form formatting (especially for dates)
      const formattedData = {
        ...emp,
        ...data,
        date_of_birth: data.date_of_birth ? data.date_of_birth : emp.date_of_birth,
        joined_date: data.joined_date ? data.joined_date : emp.joined_date
      };
      
      setEmp(formattedData); 
      reset(data); // reset to the form data (strings)
      setEditing(false);
      toast.success('Profile updated successfully!');
    } catch (err) { toast.error('Error: ' + err.message); }
    finally { setSaving(false); }
  };


  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const fetchWithTimeout = (url, options, timeout = 30000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network request timed out')), timeout))
      ]);
    };

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'employee_photos');
      const res = await fetchWithTimeout('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error("Network response was not OK");
      
      const data = await res.json();
      if (data.url) {
        const patchRes = await fetchWithTimeout('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_url: data.url })
        });
        if (!patchRes.ok) throw new Error("Failed to save profile photo binding.");
        setEmp({ ...emp, photo_url: data.url });
      }
    } catch (err) {
      toast.error("Network Error: Could not connect to the upload server.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (passwordForm.password !== passwordForm.confirm) { toast.warn("Passwords do not match!"); return; }
    if (passwordForm.password.length < 6) { toast.warn("Password must be at least 6 characters!"); return; }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.password });
      if (error) { toast.error(error.message || "Failed to update password."); }
      else { toast.success("Password updated successfully!"); setShowPasswordModal(false); setPasswordForm({ password: '', confirm: '' }); }
    } catch (err) { toast.error('Error: ' + err.message); }
    finally { setPasswordLoading(false); }
  };


  if (!emp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl border border-slate-100 flex flex-col items-center">
           <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-6">
             <AlertCircle className="w-8 h-8 text-amber-500" />
           </div>
           <h1 className="text-xl font-black text-slate-800 tracking-tight mb-2">Profile Not Found</h1>
           <p className="text-sm font-medium text-slate-500 mb-8 px-4">
             Your account ({(employeeProfile?.email || 'authenticated user')}) is not registered in the employee directory yet.
           </p>
           <button onClick={() => window.location.reload()} className="w-full py-3.5 bg-teal-800 text-white font-bold rounded-xl shadow-md">
             Refresh Session
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isAdminView && (
            <button onClick={() => router.push('/admin/users')} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-all">
              <ArrowLeftCircle className="w-8 h-8" />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              {isAdminView ? 'Employee File' : 'My Profile'}
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              {isAdminView ? `Viewing administrative record for ${emp?.full_name}` : 'Your personal information & digital ID'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isAdminView && (
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-100"
            >
              <Lock className="w-4 h-4"/>
              Password
            </button>
          )}
          <button
            onClick={() => setView(view === 'info' ? 'card' : 'info')}
            className="flex items-center gap-2 px-4 py-2.5 glass-card rounded-xl text-sm font-bold text-teal-700 hover:bg-white transition-all"
          >
            <CreditCard className="w-4 h-4"/>
            {view === 'info' ? 'View ID Card' : 'View Info'}
          </button>
          {!isAdminView && (
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 rounded-xl text-sm font-bold text-red-600 hover:bg-red-100 transition-all border border-red-100"
            >
              <LogOut className="w-4 h-4"/>
              Logout
            </button>
          )}
        </div>
      </div>

      {view === 'card' ? (
        <div className="flex flex-col items-center gap-8 py-4">
          <DigitalIDCard emp={emp}/>
          <p className="text-xs text-slate-400 font-medium text-center">Digital Employee ID · Oxygen Bioinnovations Pvt Ltd</p>
        </div>
      ) : (
        <>
          {/* Photo + Basic Info */}
          <div className="glass-card rounded-[2rem] p-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Avatar */}
              <div className="relative">
                <div className="w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 border-2 border-white shadow-lg">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-14 h-14 text-slate-300"/>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileRef.current.click()}
                  disabled={uploadingPhoto}
                  className="absolute -bottom-2 -right-2 w-9 h-9 bg-teal-600 text-white rounded-xl flex items-center justify-center shadow-md hover:bg-teal-500 transition-all"
                >
                  {uploadingPhoto ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Upload className="w-4 h-4"/>}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload}/>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">{emp.full_name}</h2>
                <p className="text-teal-600 font-bold mt-1">{emp.designation || emp.role}</p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                  <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-xl text-xs font-bold border border-teal-100">
                    {emp.department}
                  </span>
                  <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100">
                    {emp.employee_code || 'No Emp Code'}
                  </span>
                </div>
              </div>

              {editing ? (
                <button
                  type="submit"
                  form="profile-form"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 bg-navy text-white shadow-md hover:bg-navy-hover"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Save className="w-4 h-4"/>}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 bg-navy text-white shadow-md hover:bg-navy-hover"
                >
                  <Edit3 className="w-4 h-4"/> Edit Profile
                </button>
              )}
            </div>
          </div>

          {/* Info Fields */}
          <form id="profile-form" onSubmit={handleSubmit(handleSaveSubmit)} className="glass-card rounded-[2rem] p-8">
            <h3 className="text-lg font-black text-slate-700 mb-6 uppercase tracking-wider text-sm">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InfoField 
                label="Full Name" 
                value={emp.full_name} 
                icon={User} 
                editing={editing}
                registerProps={register('full_name')}
              />
              <InfoField label="Email Address" value={emp.email} icon={Mail} readonly />
              <InfoField 
                label="Employee Code" 
                value={emp.employee_code} 
                icon={Hash} 
                editing={editing}
                registerProps={register('employee_code')}
              />
              <InfoField
                label="Date of Joining"
                value={emp.joined_date ? new Date(emp.joined_date).toLocaleDateString('en-GB') : '—'}
                icon={Calendar}
                editing={editing}
                inputType="date"
                registerProps={register('joined_date')}
              />

              <InfoField 
                label="Phone Number" 
                value={emp.phone} 
                icon={Phone} 
                editing={editing}
                registerProps={register('phone')}
              />
              <InfoField 
                label="Designation" 
                value={emp.designation} 
                icon={Briefcase} 
                editing={editing}
                registerProps={register('designation')}
              />
              <InfoField 
                label="Date of Birth" 
                value={emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString('en-GB') : '—'} 
                icon={Calendar}
                editing={editing}
                inputType="date"
                registerProps={register('date_of_birth')}
              />
              <InfoField 
                label="Blood Group" 
                value={emp.blood_group} 
                icon={Droplets}
                editing={editing}
                registerProps={register('blood_group')}
              />
              {(isAdminView || role === 'admin' || role === 'ceo' || role === 'cto') && (
                <InfoField 
                  label="Base Salary (₹)" 
                  value={emp.base_salary ? Number(emp.base_salary).toLocaleString() : '0'} 
                  icon={ShieldCheck}
                  editing={editing}
                  inputType="number"
                  registerProps={register('base_salary')}
                />
              )}
            </div>

            <div className="mt-6">
              <InfoField 
                label="Address" 
                value={emp.address} 
                icon={MapPin}
                editing={editing}
                multiline
                registerProps={register('address')}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InfoField 
                label="Emergency Contact Name" 
                value={emp.emergency_contact_name} 
                icon={AlertCircle}
                editing={editing}
                registerProps={register('emergency_contact_name')}
              />
              <InfoField 
                label="Emergency Phone" 
                value={emp.emergency_contact} 
                icon={Phone}
                editing={editing}
                registerProps={register('emergency_contact')}
              />
            </div>
          </form>

          {editing && (
            <button onClick={() => { reset(); setEditing(false); }} className="w-full py-3 glass-card rounded-2xl text-sm font-bold text-slate-500 hover:bg-white/80 transition-all flex items-center justify-center gap-2">
              <X className="w-4 h-4"/> Cancel
            </button>
          )}

          {showPasswordModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl relative animate-in fade-in zoom-in duration-200 p-8">
                <button onClick={() => setShowPasswordModal(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-all"><X className="w-5 h-5 text-gray-400"/></button>
                <h3 className="text-xl font-black text-slate-800 mb-1">Update Password</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Security Access Control</p>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">New Password</label>
                    <input required type="password" value={passwordForm.password} onChange={e => setPasswordForm({...passwordForm, password: e.target.value})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-600 transition-all outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Confirm Password</label>
                    <input required type="password" value={passwordForm.confirm} onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-600 transition-all outline-none" />
                  </div>
                  <button disabled={passwordLoading} type="submit" className="w-full py-4 bg-teal-800 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-teal-900/20 hover:bg-teal-900 transition-all active:scale-95 flex items-center justify-center gap-2">
                    {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Update Password'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InfoField({ label, value, icon: Icon, readonly, editing, multiline, inputType, registerProps }) {
  const displayVal = value || '—';
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5"/> {label}
      </label>
      {editing && !readonly ? (
        multiline ? (
          <textarea
            {...registerProps}
            rows={3}
            className="w-full px-4 py-2.5 bg-white/80 border border-white rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
          />
        ) : (
          <input
            type={inputType || 'text'}
            {...registerProps}
            className="w-full px-4 py-2.5 bg-white/80 border border-white rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        )
      ) : (
        <p className="text-sm font-bold text-slate-700 px-4 py-2.5 bg-white/40 rounded-xl border border-white/60 min-h-[42px] flex items-center">{displayVal}</p>
      )}
    </div>
  );
}
