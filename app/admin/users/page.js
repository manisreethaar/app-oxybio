'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { UserPlus, UserCog, ShieldCheck, Mail, Loader2, UserX, X, Hash, Briefcase, Sparkles } from 'lucide-react';
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
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  // Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    full_name: '', email: '', password: '',
    role: 'staff', department: 'R&D',
    designation: '', designation_code: 'RF',
    custom_code: '',
    employee_code: '', joined_date: ''
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    if (role === 'admin') fetchUsers();
    else if (!authLoading && role !== 'admin') router.push('/dashboard');
  }, [role, authLoading]);

  // Auto-generate code whenever designation or role changes
  useEffect(() => {
    if (!inviteForm.designation_code && !inviteForm.custom_code) return;
    const code = inviteForm.designation_code || inviteForm.custom_code;
    if (code.length < 1) return;
    const existingCodes = employees.map(e => e.employee_code);
    const generated = generateEmployeeCode(existingCodes, code);
    setInviteForm(f => ({ ...f, employee_code: generated }));
  }, [inviteForm.designation_code, inviteForm.custom_code, inviteForm.role, employees]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('employees').select('*').order('created_at', { ascending: true });
    setEmployees(data || []);
    setLoading(false);
  };

  const deactivateUser = async (id, currentStatus) => {
    if (id === employeeProfile.id) return alert('You cannot deactivate your own account.');
    await supabase.from('employees').update({ is_active: !currentStatus }).eq('id', id);
    fetchUsers();
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setInviting(true);
    setInviteError('');

    const designationLabel = DESIGNATION_PRESETS.find(d => d.code === inviteForm.designation_code)?.label || inviteForm.designation;

    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: inviteForm.full_name,
          email: inviteForm.email,
          password: inviteForm.password,
          role: inviteForm.role,
          department: inviteForm.department,
          employee_code: inviteForm.employee_code,
          designation: designationLabel || inviteForm.designation,
          joined_date: inviteForm.joined_date || new Date().toISOString().split('T')[0],
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to invite user');

      setShowInviteModal(false);
      setInviteForm({ full_name: '', email: '', password: '', role: 'staff', department: 'R&D', designation: '', designation_code: 'RF', custom_code: '', employee_code: '', joined_date: '' });
      fetchUsers();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"/>
    </div>
  );
  if (role !== 'admin') return null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
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
                          : <span className="text-teal-700 font-black text-sm">{emp.full_name?.substring(0,2).toUpperCase()}</span>
                        }
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                          {emp.full_name}
                          {employeeProfile.id === emp.id && <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-bold">YOU</span>}
                        </div>
                        <div className="text-xs text-slate-400 font-medium flex items-center mt-0.5">
                          <Mail className="w-3 h-3 mr-1"/> {emp.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">
                      {emp.employee_code || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-700">{emp.designation || emp.role}</div>
                    <div className="text-xs text-slate-400 font-medium flex items-center mt-0.5">
                      {emp.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 mr-1 text-purple-500"/>}
                      <span className={`uppercase tracking-wider font-bold ${emp.role === 'admin' ? 'text-purple-600' : 'text-teal-600'}`}>{emp.role}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span>{emp.department}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                    {emp.joined_date ? new Date(emp.joined_date).toLocaleDateString('en-GB') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1.5 inline-flex text-[11px] font-black uppercase tracking-wider rounded-xl border ${emp.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center space-x-1">
                    <button className="p-2 rounded-xl hover:bg-white/60 text-slate-400 hover:text-teal-600 transition-all" title="Edit Profile">
                      <UserCog className="w-5 h-5"/>
                    </button>
                    {employeeProfile.id !== emp.id && (
                      <button onClick={() => deactivateUser(emp.id, emp.is_active)} className={`p-2 rounded-xl transition-all ${emp.is_active ? 'hover:bg-red-50/50 text-slate-400 hover:text-red-600' : 'hover:bg-emerald-50/50 text-slate-400 hover:text-emerald-600'}`} title={emp.is_active ? 'Deactivate' : 'Reactivate'}>
                        <UserX className="w-5 h-5"/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

            <form onSubmit={handleInviteSubmit} className="space-y-5">
              {/* Name + Email */}
              <div className="grid grid-cols-1 gap-4">
                <Field label="Full Name">
                  <input required type="text" value={inviteForm.full_name} onChange={e => setInviteForm({...inviteForm, full_name: e.target.value})} className="input-field" placeholder="Santha Kumari R K"/>
                </Field>
                <Field label="Email Address">
                  <input required type="email" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} className="input-field" placeholder="santha@oxygenbioinnovations.com"/>
                </Field>
                <Field label="Temporary Password">
                  <input required type="text" value={inviteForm.password} onChange={e => setInviteForm({...inviteForm, password: e.target.value})} className="input-field" placeholder="Initial login password"/>
                </Field>
              </div>

              {/* Role + Department + DOJ */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Role">
                  <select value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value})} className="input-field">
                    <option value="admin">Administrator</option>
                    <option value="staff">Staff / R&D</option>
                    <option value="intern">Intern</option>
                  </select>
                </Field>
                <Field label="Department">
                  <select value={inviteForm.department} onChange={e => setInviteForm({...inviteForm, department: e.target.value})} className="input-field">
                    <option value="R&D">R&amp;D</option>
                    <option value="Admin">Admin</option>
                  </select>
                </Field>
              </div>
              <Field label="Date of Joining">
                <input type="date" value={inviteForm.joined_date} onChange={e => setInviteForm({...inviteForm, joined_date: e.target.value})} className="input-field"/>
              </Field>

              {/* Designation + Auto ID */}
              <div className="bg-white/60 rounded-2xl p-5 border border-white space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-teal-600"/>
                  <span className="text-sm font-black text-slate-700 uppercase tracking-wider">Employee ID Auto-Generator</span>
                </div>

                <Field label="Designation">
                  <select value={inviteForm.designation_code} onChange={e => {
                    const preset = DESIGNATION_PRESETS.find(d => d.code === e.target.value);
                    setInviteForm({...inviteForm, designation_code: e.target.value, designation: preset?.label || ''});
                  }} className="input-field">
                    {DESIGNATION_PRESETS.map(d => (
                      <option key={d.code} value={d.code}>{d.label} {d.code ? `(${d.code})` : ''}</option>
                    ))}
                  </select>
                </Field>

                {inviteForm.designation_code === '' && (
                  <Field label="Custom Designation Code (2-3 letters)">
                    <input type="text" maxLength={3} value={inviteForm.custom_code} onChange={e => setInviteForm({...inviteForm, custom_code: e.target.value.toUpperCase()})} className="input-field uppercase" placeholder="e.g. QA, BT, HR"/>
                  </Field>
                )}

                {/* Generated Code Preview */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block flex items-center gap-1.5"><Hash className="w-3.5 h-3.5"/> Generated Employee ID</label>
                  <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                    <span className="font-mono font-black text-teal-700 text-lg tracking-widest">{inviteForm.employee_code || '—'}</span>
                    <span className="text-xs text-teal-500 font-medium">Auto-assigned · Cannot be changed by employee</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 font-medium">Format: O2B · {inviteForm.designation_code || inviteForm.custom_code} · {ROLE_TYPE[inviteForm.role]} · Sequential No.</p>
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

      <style jsx>{`
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
