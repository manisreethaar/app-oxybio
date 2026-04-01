'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { UserPlus, UserCog, ShieldCheck, Mail, Loader2, UserX, X, Hash, Briefcase, Sparkles, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ─── Employee ID Auto-Generation Logic ──────────────────────────────────────
//
// Format: O2B-{DESIG}-{SEQ}
//   O2B  = Company prefix (fixed)
//   DESIG = Designation abbreviation (admin picks), e.g. RF, LA, TL, PM
//   SEQ   = 3-digit padded sequential number, increments per designation
//
// Examples:
//   O2B-RF-001  → 1st Research Fellow
//   O2B-RF-002  → 2nd Research Fellow
//   O2B-LA-001  → 1st Lab Analyst
//   O2B-IA-001  → 1st Intern Associate
//
const COMPANY_PREFIX = 'O2B';

const DESIGNATION_PRESETS = [
  { label: 'Chief Executive Officer (CEO)', code: 'CE' },
  { label: 'Chief Technology Officer (CTO)', code: 'CT' },
  { label: 'Research Fellow', code: 'RF' },
  { label: 'Scientist', code: 'SC' },
  { label: 'Intern', code: 'IN' },
  { label: 'Custom...', code: '' },
];

function generateEmployeeCode(existingCodes, designationCode) {
  if (!designationCode || designationCode.trim().length < 1) return '';
  const prefix = `${COMPANY_PREFIX}-${designationCode.toUpperCase()}-`;
  const existing = existingCodes
    .filter(c => c && c.startsWith(prefix))
    .map(c => parseInt(c.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

export default function UsersPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [fetchError, setFetchError] = useState('');
  const [deactivating, setDeactivating] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [correctingRole, setCorrectingRole] = useState(null); // emp object
  const [roleForm, setRoleForm] = useState({ role: '', designation: '', designation_code: '' });
  const [roleCorrectLoading, setRoleCorrectLoading] = useState(false);
  const [roleCorrectError, setRoleCorrectError] = useState('');

  useEffect(() => setIsMounted(true), []);


  // Modal State
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
      joined_date: z.string().optional()
    })),
    defaultValues: { full_name: '', email: '', password: '', role: 'staff', department: 'R&D', designation: '', designation_code: 'RF', custom_code: '', employee_code: '', joined_date: '' }
  });

  const watchDesigCode = watch('designation_code');
  const watchCustomCode = watch('custom_code');
  const watchEmployeeCode = watch('employee_code');
  const watchRole = watch('role');

  useEffect(() => {
    // Wait for auth to finish loading before making any role decision
    if (authLoading) return;
    
    // Master Admin Override
    const isMaster = (employeeProfile?.email === 'manisreethaar@gmail.com');
    const isAdmin = ['admin', 'ceo', 'cto'].includes(role) || isMaster;

    if (isAdmin) {
      fetchUsers();
    } else if (role) {
      // Authorized but not admin -> redirect
      router.push('/dashboard');
    } else if (isMounted) {
      // No role / No profile -> help user refresh or redirect to profile
      setLoading(false);
      setFetchError('Administrative profile not detected. Please Sign Out and Sign In again to refresh your session.');
    }
  }, [role, authLoading, router, isMounted, employeeProfile?.email]);


  // Auto-generate code whenever designation or role changes
  useEffect(() => {
    if (!watchDesigCode && !watchCustomCode) return;
    const code = watchDesigCode || watchCustomCode;
    if (code?.length < 1) return;
    // Only count ACTIVE employees — inactive/deactivated accounts don't consume sequence slots
    const existingCodes = employees.filter(e => e.is_active).map(e => e.employee_code);
    const generated = generateEmployeeCode(existingCodes, code);
    setValue('employee_code', generated);
  }, [watchDesigCode, watchCustomCode, watchRole, employees, setValue]);

  const fetchUsers = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      setFetchError('Failed to load employees: ' + err.message);
    } finally {
      setLoading(false);
    }
  };


  const deactivateUser = async (id, currentStatus) => {
    if (id === employeeProfile.id) { toast.warn('You cannot deactivate your own account.'); return; }
    const action = currentStatus ? "deactivate" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${action} this employee's access?`)) return;

    if (deactivating) return;
    setDeactivating(id);
    try {
      const res = await fetch('/api/admin/deactivate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, target_status: !currentStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status');
      fetchUsers();
    } catch (err) { toast.error('Action failed: ' + err.message); }
    finally { setDeactivating(null); }
  };

  const [editingSalary, setEditingSalary] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(null);

  const updateSalary = async (id, newSalary) => {
    setUpdateLoading(id);
    try {
      const res = await fetch('/api/admin/update-salary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: id, base_salary: newSalary })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, base_salary: parseFloat(newSalary) } : e));
    } catch (err) {
      toast.error('Failed to update salary: ' + err.message);
    } finally {
      setUpdateLoading(null);
      setEditingSalary(null);
    }
  };

  const handleRoleCorrection = async () => {
    if (!correctingRole || !roleForm.role) return;
    setRoleCorrectLoading(true);
    setRoleCorrectError('');
    try {
      const code = roleForm.designation_code || roleForm.role.slice(0, 2).toUpperCase();
      const res = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: correctingRole.id,
          new_role: roleForm.role,
          new_designation: roleForm.designation,
          designation_code: code
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to update role');
      setCorrectingRole(null);
      fetchUsers();
      toast.success(`Role updated. New Employee ID: ${result.new_employee_code}`);
    } catch (err) {
      setRoleCorrectError(err.message);
    } finally {
      setRoleCorrectLoading(false);
    }
  };

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
      if (!res.ok) throw new Error(result.error || 'Failed to invite user');

      setShowInviteModal(false);
      reset();
      fetchUsers();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {!isMounted || authLoading || loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"/>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-red-600 font-bold">{fetchError}</p>
          <button onClick={fetchUsers} className="px-4 py-2 bg-teal-700 text-white rounded-xl font-bold text-sm">Retry</button>
        </div>
      ) : !(['admin', 'ceo', 'cto'].includes(role) || employeeProfile?.email === 'manisreethaar@gmail.com') ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
           <ShieldCheck className="w-16 h-16 text-slate-200" />
           <p className="text-slate-500 font-bold">Access Denied: Administrative Clearance Required</p>
           <button onClick={() => router.push('/dashboard')} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Return to Dashboard</button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">Team Management</h1>
              <p className="text-slate-500 mt-1 font-medium">{employees.filter(e => e.is_active).length} active team members</p>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center justify-center px-6 py-3 bg-gradient-to-br from-teal-500 to-cyan-600 text-white font-black rounded-2xl hover:from-teal-400 hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/20 active:scale-95"
            >
              <UserPlus className="w-5 h-5 mr-2"/> Add Employee
            </button>
          </div>

      {/* Table */}
      <div className="glass-card rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/40 bg-white/20">
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">ID Code</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Designation</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Joined</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Base Salary</th>
                <th className="px-6 py-5 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {employees.map((emp) => (
                <tr key={emp.id} className={`hover:bg-white/30 transition-colors ${!emp.is_active ? 'opacity-40' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-teal-100 to-cyan-100 border border-white shadow-sm shrink-0 mr-3 flex items-center justify-center">
                        {emp.photo_url
                          ? <img src={emp.photo_url} className="w-full h-full object-cover" alt=""/>
                          : <span className="text-teal-700 font-black text-sm">
                              {(() => {
                                const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
                                const parts = emp.full_name?.split(' ') || [];
                                const startIdx = (parts.length > 1 && titles.includes(parts[0])) ? 1 : 0;
                                return parts.slice(startIdx, startIdx + 2).map(n => n[0]).join('').toUpperCase();
                              })()}
                            </span>
                        }
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                          {String(emp.full_name || 'Unknown')}
                          {employeeProfile?.id === emp.id && <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-bold">YOU</span>}
                        </div>
                        <div className="text-xs text-slate-400 font-medium flex items-center mt-0.5">
                          <Mail className="w-3 h-3 mr-1"/> {String(emp.email || '')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">
                      {emp.employee_code ? String(emp.employee_code) : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-700">{String(emp.designation || emp.role || 'No Designation')}</div>
                    <div className="text-xs text-slate-400 font-medium flex items-center mt-0.5">
                      {['admin','ceo','cto'].includes(emp.role) && <ShieldCheck className="w-3.5 h-3.5 mr-1 text-purple-500"/>}
                      <span className={`uppercase tracking-wider font-bold ${['admin','ceo','cto'].includes(emp.role) ? 'text-purple-600' : 'text-teal-600'}`}>{String(emp.role || 'staff')}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span>{String(emp.department || 'Lab')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                    {emp.joined_date ? new Date(emp.joined_date).toLocaleDateString('en-GB') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {editingSalary === emp.id ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          autoFocus
                          defaultValue={emp.base_salary || 0}
                          onBlur={(e) => updateSalary(emp.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') updateSalary(emp.id, e.target.value); if (e.key === 'Escape') setEditingSalary(null); }}
                          className="w-24 px-2 py-1 text-sm border border-teal-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        {updateLoading === emp.id && <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
                      </div>
                    ) : (
                      <div 
                        className="font-mono font-bold text-slate-700 cursor-pointer hover:text-teal-600 flex items-center group"
                        onClick={() => setEditingSalary(emp.id)}
                      >
                        ₹{Number(emp.base_salary || 0).toLocaleString()}
                        <span className="ml-2 opacity-0 group-hover:opacity-100 text-[10px] text-teal-500">Edit</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1.5 inline-flex text-[11px] font-black uppercase tracking-wider rounded-xl border ${emp.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center space-x-1">
                    <button
                      onClick={() => router.push(`/profile?adminView=true&id=${emp.id}`)}
                      className="p-2 rounded-xl hover:bg-white/60 text-slate-400 hover:text-teal-600 transition-all"
                      title="View Profile"
                    >
                      <UserCog className="w-5 h-5"/>
                    </button>
                    <button
                      onClick={() => { setCorrectingRole(emp); setRoleForm({ role: emp.role || '', designation: emp.designation || '', designation_code: '' }); setRoleCorrectError(''); }}
                      className="p-2 rounded-xl hover:bg-amber-50/60 text-slate-400 hover:text-amber-600 transition-all"
                      title="Correct Role & ID"
                    >
                      <RefreshCw className="w-5 h-5"/>
                    </button>
                    {employeeProfile.id !== emp.id && (
                      <button
                        onClick={() => deactivateUser(emp.id, emp.is_active)}
                        disabled={deactivating === emp.id}
                        className={`p-2 rounded-xl transition-all disabled:opacity-50 ${emp.is_active ? 'hover:bg-red-50/50 text-slate-400 hover:text-red-600' : 'hover:bg-emerald-50/50 text-slate-400 hover:text-emerald-600'}`}
                        title={emp.is_active ? 'Deactivate' : 'Reactivate'}>
                        {deactivating === emp.id ? <Loader2 className="w-5 h-5 animate-spin"/> : <UserX className="w-5 h-5"/>}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Correct Role Modal */}
      {correctingRole && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 relative shadow-2xl">
            <button onClick={() => setCorrectingRole(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
            <h2 className="text-xl font-black text-slate-800 mb-1">Correct Role & Employee ID</h2>
            <p className="text-sm text-slate-500 mb-1">Changing: <strong>{correctingRole.full_name}</strong></p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5 font-medium">⚠️ This will regenerate the Employee ID Code. The new code will be shown after saving.</p>
            {roleCorrectError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4 border border-red-100 font-medium">{roleCorrectError}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">New System Role (Controls Access)</label>
                <select value={roleForm.role} onChange={e => setRoleForm(p => ({...p, role: e.target.value}))} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-400">
                  <option value="intern">Intern</option>
                  <option value="research_intern">Research Intern</option>
                  <option value="scientist">Scientist</option>
                  <option value="research_fellow">Research Fellow</option>
                  <option value="cto">CTO</option>
                  <option value="ceo">CEO</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Display Designation (Label on ID Card)</label>
                <input value={roleForm.designation} onChange={e => setRoleForm(p => ({...p, designation: e.target.value}))} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-400" placeholder="e.g. Research Fellow, Lab Intern"/>
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">ID Code Abbreviation (2-3 letters)</label>
                <input maxLength={3} value={roleForm.designation_code} onChange={e => setRoleForm(p => ({...p, designation_code: e.target.value.toUpperCase()}))} className="w-full border border-slate-200 rounded-xl p-3 text-sm font-mono font-bold text-slate-700 outline-none focus:border-teal-400 uppercase" placeholder="e.g. RF, IN, SC"/>
                <p className="text-[10px] text-slate-400 mt-1">Leave blank to auto-derive from role.</p>
              </div>
              <button onClick={handleRoleCorrection} disabled={roleCorrectLoading || !roleForm.role} className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                {roleCorrectLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                {roleCorrectLoading ? 'Updating...' : 'Apply Role Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="glass-panel rounded-[2rem] max-w-lg w-full p-8 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowInviteModal(false)} className="absolute top-6 right-6 w-9 h-9 bg-white/60 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white transition-all">
              <X className="w-5 h-5"/>
            </button>
            <h2 className="text-2xl font-black text-slate-800 mb-1 tracking-tight">Add Employee</h2>
            <p className="text-slate-500 text-sm mb-6">System will auto-generate the employee ID code.</p>

            {inviteError && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100 font-medium">{inviteError}</div>}

            <form onSubmit={handleSubmit(handleInviteSubmit)} className="space-y-5 pb-32">
              {/* Name + Email */}
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

              {/* Role + Department + DOJ */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Role">
                  <select {...register('role')} className="input-field">
                    <option value="admin">Administrator</option>
                    <option value="staff">Staff / R&D</option>
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

              {/* Designation + Auto ID */}
              <div className="bg-white/60 rounded-2xl p-5 border border-white space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-teal-600"/>
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

                {/* Generated Code Preview */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block flex items-center gap-1.5"><Hash className="w-3.5 h-3.5"/> Generated Employee ID</label>
                  <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                    <span className="font-mono font-black text-teal-700 text-lg tracking-widest">{watchEmployeeCode || '—'}</span>
                    <span className="text-xs text-teal-500 font-medium">Auto-assigned · Cannot be changed by employee</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 font-medium">Format: O2B · {watchDesigCode || watchCustomCode} · {watchRole?.toUpperCase()} · Sequential No.</p>
                </div>
              </div>

              <button disabled={inviting} type="submit" className="w-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white font-black py-4 rounded-2xl hover:from-teal-400 hover:to-cyan-500 transition-all disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-teal-500/20 active:scale-95">
                {inviting ? <Loader2 className="w-5 h-5 animate-spin"/> : <UserPlus className="w-5 h-5"/>}
                {inviting ? 'Creating Account...' : 'Create Employee Account'}
              </button>
            </form>
          </div>
        </div>
          )}
        </>
      )}

      <style>{`

        .input-field {
          width: 100%;
          padding: 0.625rem 1rem;
          background: rgba(255,255,255,0.7);
          border: 1px solid rgba(255,255,255,0.9);
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

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
