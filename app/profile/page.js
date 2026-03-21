'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { 
  User, Phone, MapPin, Calendar, Droplets, AlertCircle, 
  Mail, Briefcase, Hash, LogOut, Upload, Edit3, Save, X, 
  CreditCard, ArrowLeft, ShieldCheck, CheckSquare
} from 'lucide-react';
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

      <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase text-center leading-none mt-2">{emp.full_name}</h2>
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
          <QRCodeSVG value={`https://app-oxybio.vercel.app/verify/${emp.id}`} size={64} level="M" />
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { employeeProfile, signOut } = useAuth();
  const [emp, setEmp] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [view, setView] = useState('info'); // 'info' | 'card'
  const fileRef = useRef();
  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) {
      setEmp(employeeProfile);
      setForm(employeeProfile);
    }
  }, [employeeProfile]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('employees').update({
      phone: form.phone,
      designation: form.designation,
      date_of_birth: form.date_of_birth || null,
      address: form.address,
      blood_group: form.blood_group,
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact: form.emergency_contact,
    }).eq('id', emp.id);
    if (!error) {
      setEmp({ ...emp, ...form });
      setEditing(false);
    }
    setSaving(false);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'employee_photos');
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      await supabase.from('employees').update({ photo_url: data.url }).eq('id', emp.id);
      setEmp({ ...emp, photo_url: data.url });
    }
    setUploadingPhoto(false);
  };

  if (!emp) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">My Profile</h1>
          <p className="text-slate-500 font-medium mt-1">Your personal information & digital ID</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView(view === 'info' ? 'card' : 'info')}
            className="flex items-center gap-2 px-4 py-2.5 glass-card rounded-xl text-sm font-bold text-teal-700 hover:bg-white transition-all"
          >
            <CreditCard className="w-4 h-4"/>
            {view === 'info' ? 'View ID Card' : 'View Info'}
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 rounded-xl text-sm font-bold text-red-600 hover:bg-red-100 transition-all border border-red-100"
          >
            <LogOut className="w-4 h-4"/>
            Logout
          </button>
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

              <button
                onClick={() => editing ? handleSave() : setEditing(true)}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md hover:from-teal-400 hover:to-cyan-500"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : editing ? <Save className="w-4 h-4"/> : <Edit3 className="w-4 h-4"/>}
                {editing ? (saving ? 'Saving...' : 'Save Changes') : 'Edit Profile'}
              </button>
            </div>
          </div>

          {/* Info Fields */}
          <div className="glass-card rounded-[2rem] p-8">
            <h3 className="text-lg font-black text-slate-700 mb-6 uppercase tracking-wider text-sm">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InfoField label="Full Name" value={emp.full_name} icon={User} readonly />
              <InfoField label="Email Address" value={emp.email} icon={Mail} readonly />
              <InfoField label="Employee Code" value={emp.employee_code} icon={Hash} readonly />
              <InfoField label="Date of Joining" value={emp.joined_date ? new Date(emp.joined_date).toLocaleDateString('en-GB') : '—'} icon={Calendar} readonly />

              <InfoField 
                label="Phone Number" 
                value={emp.phone} 
                icon={Phone} 
                editing={editing}
                onChange={v => setForm({...form, phone: v})}
                formValue={form.phone}
              />
              <InfoField 
                label="Designation" 
                value={emp.designation} 
                icon={Briefcase} 
                editing={editing}
                onChange={v => setForm({...form, designation: v})}
                formValue={form.designation}
              />
              <InfoField 
                label="Date of Birth" 
                value={emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString('en-GB') : '—'} 
                icon={Calendar}
                editing={editing}
                inputType="date"
                onChange={v => setForm({...form, date_of_birth: v})}
                formValue={form.date_of_birth}
              />
              <InfoField 
                label="Blood Group" 
                value={emp.blood_group} 
                icon={Droplets}
                editing={editing}
                onChange={v => setForm({...form, blood_group: v})}
                formValue={form.blood_group}
              />
            </div>

            <div className="mt-6">
              <InfoField 
                label="Address" 
                value={emp.address} 
                icon={MapPin}
                editing={editing}
                multiline
                onChange={v => setForm({...form, address: v})}
                formValue={form.address}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <InfoField 
                label="Emergency Contact Name" 
                value={emp.emergency_contact_name} 
                icon={AlertCircle}
                editing={editing}
                onChange={v => setForm({...form, emergency_contact_name: v})}
                formValue={form.emergency_contact_name}
              />
              <InfoField 
                label="Emergency Phone" 
                value={emp.emergency_contact} 
                icon={Phone}
                editing={editing}
                onChange={v => setForm({...form, emergency_contact: v})}
                formValue={form.emergency_contact}
              />
            </div>
          </div>

          {editing && (
            <button onClick={() => setEditing(false)} className="w-full py-3 glass-card rounded-2xl text-sm font-bold text-slate-500 hover:bg-white/80 transition-all flex items-center justify-center gap-2">
              <X className="w-4 h-4"/> Cancel
            </button>
          )}
        </>
      )}
    </div>
  );
}

function InfoField({ label, value, icon: Icon, readonly, editing, onChange, formValue, multiline, inputType }) {
  const displayVal = value || '—';
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5"/> {label}
      </label>
      {editing && !readonly ? (
        multiline ? (
          <textarea
            value={formValue || ''}
            onChange={e => onChange(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 bg-white/80 border border-white rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
          />
        ) : (
          <input
            type={inputType || 'text'}
            value={formValue || ''}
            onChange={e => onChange(e.target.value)}
            className="w-full px-4 py-2.5 bg-white/80 border border-white rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        )
      ) : (
        <p className="text-sm font-bold text-slate-700 px-4 py-2.5 bg-white/40 rounded-xl border border-white/60 min-h-[42px] flex items-center">{displayVal}</p>
      )}
    </div>
  );
}
