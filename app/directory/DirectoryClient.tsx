// @ts-nocheck
'use client';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/context/ToastContext';
import { User, Phone, Mail, MapPin, Droplets, Search, CreditCard, X, Briefcase, Hash, Calendar, AlertCircle, ShieldCheck, CheckSquare, Loader2, UserPlus, UserCog, Sparkles, RefreshCw, Save, Power, Building2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import PERMISSIONS, { ROLE_WEIGHTS } from '@/lib/permissions';

// ─── Employee ID Auto-Generation Logic ──────────────────────────────────────
const COMPANY_PREFIX = 'O2B';
const DESIGNATION_PRESETS = [
  { label: 'Chief Executive Officer (CEO)', code: 'CE' },
  { label: 'Chief Technology Officer (CTO)', code: 'CT' },
  { label: 'Research Fellow', code: 'RF' },
  { label: 'Scientist', code: 'SC' },
  { label: 'Research Intern', code: 'RI' },
  { label: 'Intern', code: 'IN' },
  { label: 'Custom...', code: '' },
];
const ROLE_TO_CODE = {
  'ceo': 'CE', 'cto': 'CT', 'research_fellow': 'RF', 'scientist': 'SC',
  'research_intern': 'RI', 'intern': 'IN', 'admin': 'AD', 'staff': 'ST',
};

function generateEmployeeCode(existingCodes: string[], designationCode: string) {
  if (!designationCode || designationCode.trim().length < 1) return '';
  const prefix = `${COMPANY_PREFIX}-${designationCode.toUpperCase()}-`;
  const taken = new Set(
    existingCodes
      .filter(c => c && c.startsWith(prefix))
      .map(c => parseInt(c.replace(prefix, ''), 10))
      .filter(n => !isNaN(n))
  );
  let num = 1;
  while (taken.has(num)) num++;
  return `${prefix}${String(num).padStart(3, '0')}`;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ProfileModal({ emp, onClose, isAdmin, onEdit, onToggleActive, onDelete }: {
  emp: any; onClose: () => void; isAdmin: boolean; onEdit: (e: any) => void; onToggleActive: (e: any) => void; onDelete?: (e: any) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    await onToggleActive(emp);
    setToggling(false);
  };

  return (
    <div className="fixed inset-0 bg-transparent flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-lg rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden max-h-[95dvh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

        {/* ── Header gradient strip ── */}
        <div className="relative shrink-0 bg-gradient-to-br from-slate-800 via-navy to-violet-700 pt-5 pb-16 px-6 rounded-t-[2rem]">
          <div className="flex items-center justify-between">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
              emp.is_active
                ? 'bg-emerald-400/20 text-emerald-200 border-emerald-300/30'
                : 'bg-red-400/20 text-red-200 border-red-300/30'
            }`}>{emp.is_active ? 'Active' : 'Inactive'}</span>
            <button onClick={onClose} className="w-9 h-9 bg-white/10 hover:bg-white/25 text-white rounded-full flex items-center justify-center transition-colors">
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* ── Avatar overlapping header ── */}
        <div className="px-6 -mt-12 flex items-end gap-4 shrink-0">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-4 border-white shadow-xl shrink-0">
            {emp.photo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-50 to-slate-100 text-violet-600 font-black text-2xl">
                {emp.full_name?.split(' ').slice(0,2).map((n: string) => n[0]).join('').toUpperCase()}
              </div>
            )}
          </div>
          <div className="pb-2 flex-1 min-w-0">
            <h2 className="text-xl font-black text-slate-800 leading-tight truncate">{emp.full_name}</h2>
            <p className="text-xs font-bold text-navy mt-0.5">{emp.designation || emp.role?.replace(/_/g, ' ')}</p>
          </div>
        </div>

        {/* ── Pill row ── */}
        <div className="px-6 pt-3 pb-4 flex flex-wrap gap-2 shrink-0">
          {emp.employee_code && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-navy/5 text-navy rounded-full text-[11px] font-black border border-navy/10">
              <Hash className="w-3 h-3"/>{emp.employee_code}
            </span>
          )}
          {emp.department && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold border border-slate-200">
              <Building2 className="w-3 h-3"/>{emp.department}
            </span>
          )}
          {emp.blood_group && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-[11px] font-bold border border-red-100">
              <Droplets className="w-3 h-3"/>{emp.blood_group}
            </span>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto border-t border-slate-100 px-6 py-5 pb-10 space-y-4">

          {/* Contact */}
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-400"/><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact</span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center gap-3 px-4 py-3">
                <Mail className="w-4 h-4 text-violet-500 shrink-0"/>
                <span className="text-sm font-medium text-slate-700 break-all">{emp.email || '—'}</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Phone className="w-4 h-4 text-violet-500 shrink-0"/>
                <span className="text-sm font-medium text-slate-700">{emp.phone || '—'}</span>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400"/><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Important Dates</span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Date of Birth</span>
                <span className="text-sm font-semibold text-slate-800">{emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Date of Joining</span>
                <span className="text-sm font-semibold text-slate-800">{emp.joined_date ? new Date(emp.joined_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Emergency */}
          <div className="rounded-2xl border border-red-100 overflow-hidden">
            <div className="bg-red-50 px-4 py-2.5 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400"/><span className="text-[10px] font-black uppercase tracking-widest text-red-400">Emergency Contact</span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Name</span>
                <span className="text-sm font-semibold text-slate-700">{emp.emergency_contact_name || '—'}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Phone</span>
                <span className="text-sm font-semibold text-slate-700">{emp.emergency_contact || '—'}</span>
              </div>
            </div>
          </div>

          {/* Address */}
          {emp.address && (
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400"/><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Address</span>
              </div>
              <p className="px-4 py-3 text-sm font-medium text-slate-700 leading-relaxed">{emp.address}</p>
            </div>
          )}

          {/* Admin-only: compensation + activate/deactivate */}
          {isAdmin && (
            <>
              {emp.base_salary && (
                <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-600">
                    <CreditCard className="w-3.5 h-3.5"/>Base Salary
                  </div>
                  <span className="text-lg font-black text-violet-700">
                    Rs.{Number(emp.base_salary).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Status toggle */}
              <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between ${emp.is_active ? 'border-red-100 bg-red-50/40' : 'border-emerald-100 bg-emerald-50/40'}`}>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${emp.is_active ? 'text-red-500' : 'text-emerald-600'}`}>
                    {emp.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {emp.is_active ? 'Revoke access to OxyOS' : 'Restore access to OxyOS'}
                  </p>
                </div>
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-60 ${
                    emp.is_active
                      ? 'bg-red-100 hover:bg-red-200 text-red-700'
                      : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                  }`}
                >
                  {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Power className="w-3.5 h-3.5"/>}
                  {emp.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Footer actions ── */}
        {isAdmin && (
          <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex gap-3 bg-white">
            <button
              onClick={() => { onClose(); onEdit(emp); }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-navy text-white font-black rounded-xl hover:bg-navy/90 text-sm transition-colors"
            >
              <UserCog className="w-4 h-4"/> Edit Full Profile
            </button>
            {onDelete && (
              <button
                onClick={() => { onClose(); onDelete(emp); }}
                className="flex-none px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-black rounded-xl transition-colors"
                title="Delete Employee"
              >
                <Trash2 className="w-5 h-5"/>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeeIDCard({ emp, onClose, onEdit, isAdmin }) {
  const [showFullProfile, setShowFullProfile] = useState(false);

  return (
    <div className="fixed inset-0 bg-transparent flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-sm">
        <button onClick={onClose} className="absolute -top-4 -right-4 z-40 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 transition-colors">
          <X className="w-5 h-5 text-slate-600"/>
        </button>
        
        {isAdmin && (
          <button onClick={() => { onClose(); onEdit(emp); }} className="absolute -top-4 -left-4 z-40 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-violet-50 transition-colors" title="Edit Employee">
            <UserCog className="w-5 h-5 text-violet-600"/>
          </button>
        )}
        
        {/* Modern ID Card Engine */}
        <div className="bg-white rounded-[2rem] p-6 shadow-2xl w-full mx-auto border border-slate-200 flex flex-col items-center relative overflow-y-auto overflow-x-hidden max-h-[85vh]">
          <div className="absolute top-0 left-0 w-full h-36 bg-gradient-to-br from-navy to-slate-800"/>
          
          {/* Header */}
          <div className="w-full relative z-10 flex justify-between items-start mb-8">
            <div>
              <h3 className="text-white font-black tracking-widest text-sm uppercase">OXYGEN</h3>
              <p className="text-violet-100 font-bold tracking-widest text-[9px] uppercase">Bioinnovations</p>
            </div>
            <div className={`px-2 py-1 backdrop-blur-sm rounded flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border ${
              emp.is_active ? 'bg-white/20 text-white border-white/30' : 'bg-red-500/40 text-white border-red-300/50'
            }`}>
              <CheckSquare className="w-3 h-3"/> {emp.is_active ? 'Active' : 'Inactive'}
            </div>
          </div>

          {/* Profile Core */}
          <div className="relative z-10 w-28 h-28 rounded-2xl overflow-hidden bg-white border-[3px] border-white shadow-lg mb-4">
            {emp.photo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-100">
                <User className="w-10 h-10 text-slate-300"/>
              </div>
            )}
          </div>

          <h2 className="text-xl font-black text-slate-800 tracking-tight text-center leading-none mt-2">{emp.full_name}</h2>
          <p className="text-xs font-bold text-navy tracking-widest uppercase mt-2 mb-6 text-center">{emp.designation || emp.role}</p>
          
          <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center mb-2 shadow-inner">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Official Employee Code</p>
            <p className="font-mono text-2xl font-black text-slate-800 tracking-widest">{emp.employee_code || 'PENDING'}</p>
          </div>

          <div className="w-full space-y-2 mt-2 px-2 text-[10px] font-semibold text-slate-500">
            {emp.phone && <p className="flex items-center"><Phone className="w-3 h-3 mr-2" />{emp.phone}</p>}
            {emp.email && <p className="flex items-center"><Mail className="w-3 h-3 mr-2" />{emp.email}</p>}
            {emp.blood_group && <p className="flex items-center"><Droplets className="w-3 h-3 mr-2 text-red-500" />Blood Group: <span className="ml-1 text-red-600 font-bold">{emp.blood_group}</span></p>}
          </div>

          {showFullProfile && (
            <div className="w-full mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-[10px] text-slate-600 text-left animate-in fade-in slide-in-from-top-2">
                {emp.date_of_birth && <p><span className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block mb-0.5">Date of Birth</span> {new Date(emp.date_of_birth).toLocaleDateString('en-IN')}</p>}
                {emp.joined_date && <p><span className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block mb-0.5">Date of Joining</span> {new Date(emp.joined_date).toLocaleDateString('en-IN')}</p>}
                {emp.address && <p><span className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block mb-0.5">Address</span> {emp.address}</p>}
                {(emp.emergency_contact || emp.emergency_contact_name) && (
                  <p><span className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block mb-0.5">Emergency Contact</span> {emp.emergency_contact_name} {emp.emergency_contact ? `(${emp.emergency_contact})` : ''}</p>
                )}
            </div>
          )}

          <button onClick={() => setShowFullProfile(!showFullProfile)} className="mt-4 text-[9px] font-black text-violet-600 hover:text-violet-700 transition-colors uppercase tracking-widest">
            {showFullProfile ? 'Hide Profile' : 'View Full Profile'}
          </button>

          {/* QR Code Section */}
          <div className="w-full mt-4 pt-5 border-t border-slate-100 flex items-center justify-between">
            <div className="text-left pr-4">
              <p className="text-[9px] font-black text-navy uppercase tracking-widest mb-1.5 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Global Audit Tag</p>
              <p className="text-[10px] font-bold text-slate-500 leading-relaxed">Scan to securely verify identity & access.</p>
            </div>
            <div className="p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm shrink-0">
              <QRCodeSVG value={`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.oxygenbioinnovations.com'}/verify/${emp.id}`} size={64} level="M" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DirectoryClient({ initialEmployees }: { initialEmployees: any[] }) {
  const { canDo, loading: authLoading, isAdmin } = useAuth() as any;
  const toast = useToast();
  const [employees, setEmployees] = useState(initialEmployees || []);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (authLoading) return;
    if (!canDo('directory', 'view')) {
      router.push('/dashboard');
      return;
    }
    fetchEmployees(); // We fetch all employees to allow proper grouping
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDo, authLoading, router]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('employees')
        .select('*')
        .order('full_name');

      if (!isAdmin) {
          query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error("Directory fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = employees;
    if (!showInactive) {
      result = result.filter(e => e.is_active);
    }
    if (!search) return result;
    return result.filter(e => e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.employee_code?.toLowerCase().includes(search.toLowerCase()));
  }, [employees, search, showInactive]);

  const groupedEmployees = useMemo(() => {
      const groups = {};
      filtered.forEach(emp => {
          const roleKey = emp.role || 'staff';
          if (!groups[roleKey]) groups[roleKey] = { role: roleKey, weight: ROLE_WEIGHTS[roleKey] || 0, employees: [] };
          groups[roleKey].employees.push(emp);
      });
      return Object.values(groups).sort((a, b) => b.weight - a.weight);
  }, [filtered]);

  // Invite Modal logic
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const { register, handleSubmit, watch, setValue, reset } = useForm({
    resolver: zodResolver(z.object({
      full_name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.string(),
      department: z.string(),
      designation: z.string().optional(),
      designation_code: z.string().optional(),
      custom_code: z.string().max(3).optional(),
      employee_code: z.string().optional(),
      joined_date: z.string().optional(),
      base_salary: z.string().optional()
    })),
    defaultValues: { full_name: '', email: '', password: '', role: 'staff', department: 'R&D', designation: '', designation_code: 'RF', custom_code: '', employee_code: '', joined_date: '' }
  });

  const watchDesigCode = watch('designation_code');
  const watchCustomCode = watch('custom_code');
  const watchEmployeeCode = watch('employee_code');
  const watchRole = watch('role');

  useEffect(() => {
    if (!watchDesigCode && !watchCustomCode) return;
    const code = watchDesigCode || watchCustomCode;
    if (code?.length < 1) return;
    const existingCodes = employees.map(e => e.employee_code);
    const generated = generateEmployeeCode(existingCodes, code);
    setValue('employee_code', generated);
  }, [watchDesigCode, watchCustomCode, watchRole, employees, setValue]);

  const handleInviteSubmit = async (data) => {
    setInviting(true);
    setInviteError('');
    const designationLabel = DESIGNATION_PRESETS.find(d => d.code === data.designation_code)?.label || data.designation;

    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.full_name,
          email: data.email,
          password: data.password,
          role: data.role,
          department: data.department,
          employee_code: data.employee_code,
          designation: designationLabel || data.designation,
          joined_date: data.joined_date || new Date().toISOString().split('T')[0],
          base_salary: parseFloat(data.base_salary || 0)
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create employee');

      toast.success(`${data.full_name} has been added successfully! 🎉`);
      setShowInviteModal(false);
      reset();
      fetchEmployees();
    } catch (err) {
      setInviteError(err.message);
      toast.error('Failed to add employee: ' + err.message);
    } finally {
      setInviting(false);
    }
  };

  // Edit logic
  const [activeTab, setActiveTab] = useState('details');
  const [updateLoading, setUpdateLoading] = useState(false);

  const [editForm, setEditForm] = useState({});
  const [customPerms, setCustomPerms] = useState({});

  useEffect(() => {
    if (editingEmployee) {
      setEditForm({
         base_salary: editingEmployee.base_salary || '',
         role: editingEmployee.role || 'staff',
         designation: editingEmployee.designation || '',
         is_active: editingEmployee.is_active,
         address: editingEmployee.address || '',
         emergency_contact: editingEmployee.emergency_contact || '',
         emergency_contact_name: editingEmployee.emergency_contact_name || '',
         date_of_birth: editingEmployee.date_of_birth || '',
         joined_date: editingEmployee.joined_date || ''
      });
      setCustomPerms(editingEmployee.custom_permissions || {});
    }
  }, [editingEmployee]);

  const handleUpdateDetails = async () => {
     setUpdateLoading(true);
     try {
         // Update Salary
         await fetch('/api/admin/update-salary', {
             method: 'POST', headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ employee_id: editingEmployee.id, base_salary: editForm.base_salary })
         });
         
         // Update Role
         await fetch('/api/admin/update-role', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: editingEmployee.id,
                new_role: editForm.role,
                new_designation: editForm.designation,
                designation_code: ROLE_TO_CODE[editForm.role] || editForm.role.substring(0,2).toUpperCase()
            })
         });

         // Deactivate/Activate if changed
         if (editForm.is_active !== editingEmployee.is_active) {
            await fetch('/api/admin/deactivate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingEmployee.id, target_status: editForm.is_active })
            });
         }

         // Update Profile Details
         await fetch('/api/admin/update-profile', {
             method: 'POST', headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
                 employee_id: editingEmployee.id, 
                 address: editForm.address,
                 emergency_contact: editForm.emergency_contact,
                 emergency_contact_name: editForm.emergency_contact_name,
                 date_of_birth: editForm.date_of_birth,
                 joined_date: editForm.joined_date
             })
         });

         toast.success("Employee details updated");
         setEditingEmployee(null);
         fetchEmployees();
     } catch (err) {
         toast.error(err.message);
     } finally {
         setUpdateLoading(false);
     }
  };

  const handleUpdatePermissions = async () => {
      setUpdateLoading(true);
      try {
          const res = await fetch('/api/admin/update-permissions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ employee_id: editingEmployee.id, custom_permissions: customPerms })
          });
          if (!res.ok) throw new Error("Failed to update permissions");
          toast.success("Access management updated");
          setEditingEmployee(null);
          fetchEmployees();
      } catch (err) {
          toast.error(err.message);
      } finally {
          setUpdateLoading(false);
      }
  };

  const handleToggleActive = async (emp: any) => {
    try {
      const res = await fetch('/api/admin/deactivate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: emp.id, target_status: !emp.is_active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(emp.is_active ? `${emp.full_name} deactivated` : `${emp.full_name} reactivated`);
      await fetchEmployees();
      // update the viewingProfile state to reflect new status
      setViewingProfile((prev: any) => prev ? { ...prev, is_active: !emp.is_active } : null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteEmployee = async (emp: any) => {
    if (!window.confirm(`Are you sure you want to completely delete ${emp.full_name}? This action cannot be undone.`)) return;
    setUpdateLoading(true);
    try {
      const res = await fetch('/api/admin/delete-employee', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: emp.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`${emp.full_name} deleted successfully`);
      setEditingEmployee(null);
      await fetchEmployees();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Staff Directory</h1>
          <p className="text-slate-500 font-medium mt-1">{employees.length} team members</p>
        </div>
        {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center justify-center px-6 py-3 bg-gradient-to-br from-violet-500 to-cyan-600 text-white font-black rounded-2xl hover:from-violet-400 hover:to-cyan-500 transition-all shadow-lg shadow-violet-500/20 active:scale-95"
            >
              <UserPlus className="w-5 h-5 mr-2"/> Add Employee
            </button>
        )}
      </div>

      {/* Search Bar & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/>
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 glass-card rounded-2xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy placeholder:text-slate-400"
          />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 px-6 py-4 glass-card rounded-2xl cursor-pointer text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap border border-slate-100 shadow-sm">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 w-4 h-4"/>
            Show Inactive Members
          </label>
        )}
      </div>

      {/* Employee Cards Grid Grouped */}
      {loading && employees.length === 0 ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <User className="w-16 h-16 mx-auto mb-4 opacity-30"/>
          <p className="font-bold text-lg">No employees found</p>
        </div>
      ) : (
        <div className="space-y-12">
            {groupedEmployees.map(group => (
                <div key={group.role} className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-2">{group.role.replace('_', ' ')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {group.employees.map(emp => (
                        <div key={emp.id} className={`glass-card rounded-[1.75rem] p-6 flex flex-col gap-4 cursor-pointer ${!emp.is_active ? 'opacity-50' : ''}`} onClick={() => setSelected(emp)}>
                            <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-50 to-slate-100 border border-white shadow-sm shrink-0">
                                {emp.photo_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover"/>
                                ) : (
                                <div className="w-full h-full flex items-center justify-center text-violet-600 font-black text-lg">
                                    {(() => {
                                    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
                                    const parts = emp.full_name?.split(' ') || [];
                                    const startIdx = (parts.length > 1 && titles.includes(parts[0])) ? 1 : 0;
                                    return parts.slice(startIdx, startIdx + 2).map(n => n[0]).join('').toUpperCase();
                                    })()}
                                </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-800 truncate leading-tight">{emp.full_name}</p>
                                <p className="text-xs font-bold text-navy mt-0.5">{emp.designation || emp.role}</p>
                                <p className="text-xs text-slate-400 font-medium">{emp.department}</p>
                            </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-slate-500 border-t border-white/40 pt-4">
                            {emp.employee_code && <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-slate-400"/><span className="font-bold">{emp.employee_code}</span></div>}
                            <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400"/><span className="truncate">{emp.email}</span></div>
                            {emp.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400"/>{emp.phone}</div>}
                            {emp.blood_group && <div className="flex items-center gap-2"><Droplets className="w-3.5 h-3.5 text-red-400"/><span className="font-bold text-red-600">{emp.blood_group}</span></div>}
                            </div>

                            <div className="flex gap-2 w-full mt-2">
                                <button onClick={(e) => { e.stopPropagation(); setViewingProfile(emp); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-black text-slate-600 border border-slate-200 transition-all shadow-sm">
                                    <User className="w-3.5 h-3.5"/> Profile
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setSelected(emp); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/60 hover:bg-white rounded-xl text-xs font-black text-navy border border-white transition-all shadow-sm">
                                    <CreditCard className="w-3.5 h-3.5"/> ID Card
                                </button>
                                {isAdmin && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setEditingEmployee(emp); }} 
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-50 hover:bg-violet-100 rounded-xl text-xs font-black text-violet-700 border border-violet-100 transition-all shadow-sm"
                                    >
                                        <UserCog className="w-3.5 h-3.5"/> Edit
                                    </button>
                                )}
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      )}

        {/* ID Card Modal */}
      {selected && typeof document !== 'undefined' && createPortal(
        <EmployeeIDCard emp={selected} onClose={() => setSelected(null)} onEdit={(e) => setEditingEmployee(e)} isAdmin={isAdmin}/>,
        document.body
      )}

        {/* Profile Modal */}
      {viewingProfile && typeof document !== 'undefined' && createPortal(
        <ProfileModal emp={viewingProfile} onClose={() => setViewingProfile(null)} onEdit={(e) => setEditingEmployee(e)} isAdmin={isAdmin} onToggleActive={handleToggleActive} onDelete={handleDeleteEmployee}/>,
        document.body
      )}

      {/* Admin Quick Edit Profile Modal */}
      {editingEmployee && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-transparent flex justify-center items-center z-50 p-0 sm:p-4">
            <div className="flex flex-col bg-white rounded-[2rem] max-w-2xl w-full p-5 md:p-8 relative shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
                <button onClick={() => setEditingEmployee(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Edit {editingEmployee.full_name}</h2>
                <p className="text-sm text-slate-500 mb-6">Manage details and specific access overrides for this user.</p>

                <div className="flex gap-4 border-b border-slate-200 mb-6">
                    <button className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-violet-500 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`} onClick={() => setActiveTab('details')}>Details & Role</button>
                    <button className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'access' ? 'border-violet-500 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`} onClick={() => setActiveTab('access')}>Access Management</button>
                </div>

                {activeTab === 'details' && (
                    <div className="space-y-5">
                        <Field label="System Role">
                            <select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700">
                                <option value="intern">Intern</option>
                                <option value="research_intern">Research Intern</option>
                                <option value="scientist">Scientist</option>
                                <option value="research_fellow">Research Fellow</option>
                                <option value="cto">CTO</option>
                                <option value="ceo">CEO</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </Field>
                        <Field label="Display Designation">
                            <input value={editForm.designation} onChange={e => setEditForm({...editForm, designation: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700"/>
                        </Field>
                        <Field label="Base Salary (₹)">
                            <input type="number" value={editForm.base_salary} onChange={e => setEditForm({...editForm, base_salary: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700"/>
                        </Field>
                        <Field label="Account Status">
                             <select value={editForm.is_active} onChange={e => setEditForm({...editForm, is_active: e.target.value === 'true'})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700">
                                <option value="true">Active</option>
                                <option value="false">Inactive / Deactivated</option>
                            </select>
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Date of Birth">
                                <input type="date" value={editForm.date_of_birth} onChange={e => setEditForm({...editForm, date_of_birth: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700"/>
                            </Field>
                            <Field label="Date of Joining">
                                <input type="date" value={editForm.joined_date} onChange={e => setEditForm({...editForm, joined_date: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700"/>
                            </Field>
                        </div>
                        <Field label="Address">
                            <textarea value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700" rows={2}/>
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Emergency Contact Name">
                                <input value={editForm.emergency_contact_name} onChange={e => setEditForm({...editForm, emergency_contact_name: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700"/>
                            </Field>
                            <Field label="Emergency Contact Number">
                                <input value={editForm.emergency_contact} onChange={e => setEditForm({...editForm, emergency_contact: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700"/>
                            </Field>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button onClick={handleUpdateDetails} disabled={updateLoading} className="px-6 py-3 bg-violet-600 text-white font-black rounded-xl hover:bg-violet-700 transition flex items-center gap-2">
                                {updateLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Save Details
                            </button>
                        </div>

                        <div className="mt-8 pt-6 border-t border-red-100 bg-red-50/50 -mx-5 -mb-5 p-5 rounded-b-[2rem]">
                            <h4 className="text-sm font-black text-red-700 uppercase tracking-wider mb-3">Danger Zone</h4>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button 
                                    onClick={() => handleToggleActive(editingEmployee)}
                                    disabled={updateLoading} 
                                    className="flex-1 px-4 py-3 bg-white border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2 text-sm"
                                >
                                    <Power className="w-4 h-4"/> {editingEmployee.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                                </button>
                                <button 
                                    onClick={() => handleDeleteEmployee(editingEmployee)}
                                    disabled={updateLoading} 
                                    className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition flex items-center justify-center gap-2 text-sm"
                                >
                                    <X className="w-4 h-4"/> Delete Permanently
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'access' && (
                    <div className="space-y-6">
                        <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
                            Overrides the default role permissions. If unchecked, defaults to role permission. If checked, forces access.
                            This UI modifies the `custom_permissions` JSON.
                        </p>
                        
                        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                            {Object.keys(PERMISSIONS).map(moduleName => (
                                <div key={moduleName} className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm">
                                    <h4 className="font-bold text-sm text-slate-700 capitalize mb-3 border-b border-slate-50 pb-2">{moduleName.replace('_', ' ')}</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {Object.keys(PERMISSIONS[moduleName]).map(actionName => {
                                            const defaultEnabled = PERMISSIONS[moduleName]?.[actionName]?.includes(editingEmployee.role || 'staff') || false;
                                            const customOverride = customPerms[moduleName]?.[actionName];
                                            const isEnabled = customOverride !== undefined ? customOverride : defaultEnabled;
                                            const isOverridden = customOverride !== undefined && customOverride !== defaultEnabled;

                                            return (
                                                <label key={actionName} className={`flex items-center gap-2 text-xs font-semibold cursor-pointer p-2 rounded-lg transition-colors ${isOverridden ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isEnabled}
                                                        onChange={(e) => {
                                                            const newPerms = { ...customPerms };
                                                            if (!newPerms[moduleName]) newPerms[moduleName] = {};
                                                            newPerms[moduleName][actionName] = e.target.checked;
                                                            if (e.target.checked === defaultEnabled) {
                                                                delete newPerms[moduleName][actionName];
                                                                if (Object.keys(newPerms[moduleName]).length === 0) delete newPerms[moduleName];
                                                            }
                                                            setCustomPerms(newPerms);
                                                        }}
                                                        className={`rounded focus:ring-2 w-4 h-4 ${isOverridden ? 'text-amber-600 focus:ring-amber-500 border-amber-400' : 'text-violet-600 focus:ring-violet-500 border-slate-300'}`}
                                                    />
                                                    <span className="capitalize">{actionName.replace('_', ' ')}</span>
                                                    {isOverridden && <span className="text-[9px] font-black uppercase ml-auto bg-amber-200/50 px-1.5 py-0.5 rounded text-amber-800">Override</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end pt-4 border-t border-slate-100">
                            <button onClick={handleUpdatePermissions} disabled={updateLoading} className="px-6 py-3 bg-violet-600 text-white font-black rounded-xl hover:bg-violet-700 transition flex items-center gap-2">
                                {updateLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Save Permissions
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      , document.body)}

      {/* Add Employee Modal */}
      {showInviteModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-transparent flex justify-center items-center z-50 p-0 sm:p-4">
          <div className="flex flex-col glass-panel rounded-[2rem] max-w-lg w-full p-5 md:p-8 relative shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto bg-white">
            <button onClick={() => setShowInviteModal(false)} className="absolute top-6 right-6 w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all">
              <X className="w-5 h-5"/>
            </button>
            <h2 className="text-2xl font-black text-slate-800 mb-1 tracking-tight">Add Employee</h2>
            <p className="text-slate-500 text-sm mb-6">System will auto-generate the employee ID code.</p>

            {inviteError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100 font-medium">{inviteError}</div>}

            <form onSubmit={handleSubmit(handleInviteSubmit, (errors) => setInviteError(Object.values(errors)[0]?.message || 'Please fill all required fields correctly'))} className="space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Full Name">
                  <input {...register('full_name')} className="input-field" placeholder="Santha Kumari R K"/>
                </Field>
                <Field label="Email Address">
                  <input {...register('email')} className="input-field" placeholder="santha@oxygenbioinnovations.com"/>
                </Field>
                <Field label="Temporary Password">
                  <input {...register('password')} className="input-field" placeholder="Initial login password"/>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Role">
                  <select {...register('role')} className="input-field">
                    <option value="admin">Administrator</option>
                    <option value="staff">Staff / R&amp;D</option>
                    <option value="research_intern">Research Intern</option>
                    <option value="intern">Intern</option>
                  </select>
                </Field>
                <Field label="Department">
                  <select {...register('department')} className="input-field">
                    <option value="R&D">R&amp;D</option>
                    <option value="Admin">Admin</option>
                  </select>
                </Field>
              </div>
              <Field label="Date of Joining">
                <input type="date" {...register('joined_date')} className="input-field"/>
              </Field>

              <Field label="Base Salary (₹)">
                <input type="number" step="1000" {...register('base_salary')} className="input-field" placeholder="e.g. 50000"/>
              </Field>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-violet-600"/>
                  <span className="text-sm font-black text-slate-700 uppercase tracking-wider">Employee ID Auto-Generator</span>
                </div>

                <Field label="Designation">
                  <select {...register('designation_code', {
                    onChange: (e) => {
                      const preset = DESIGNATION_PRESETS.find(d => d.code === e.target.value);
                      setValue('designation', preset?.label || '');
                    }
                  })} className="input-field">
                    {DESIGNATION_PRESETS.map(d => (
                      <option key={d.code} value={d.code}>{d.label} {d.code ? `(${d.code})` : ''}</option>
                    ))}
                  </select>
                </Field>

                {!watchDesigCode && (
                  <Field label="Custom Designation Code (2-3 letters)">
                    <input type="text" maxLength={3} {...register('custom_code', {
                      onChange: (e) => setValue('custom_code', e.target.value.toUpperCase())
                    })} className="input-field uppercase" placeholder="e.g. QA, BT, HR"/>
                  </Field>
                )}

                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block flex items-center gap-1.5"><Hash className="w-3.5 h-3.5"/> Generated Employee ID</label>
                  <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="font-mono font-black text-violet-700 text-lg tracking-widest">{watchEmployeeCode || '—'}</span>
                  </div>
                </div>
              </div>

              <button disabled={inviting} type="submit" className="w-full bg-gradient-to-br from-violet-500 to-cyan-600 text-white font-black py-4 rounded-2xl hover:from-violet-400 hover:to-cyan-500 transition-all disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-violet-500/20 active:scale-95">
                {inviting ? <Loader2 className="w-5 h-5 animate-spin"/> : <UserPlus className="w-5 h-5"/>}
                {inviting ? 'Creating Account...' : 'Create Employee Account'}
              </button>
            </form>
          </div>
        </div>
      , document.body)}

      <style>{`
        .input-field {
          width: 100%;
          padding: 0.625rem 1rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus { ring: 2px; border-color: #14b8a6; background: white; }
      `}</style>
    </div>
  );
}
