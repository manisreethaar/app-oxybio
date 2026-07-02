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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-lg rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden max-h-[95dvh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

        {/* ── Header gradient strip ── */}
        <div className="relative shrink-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 pt-5 pb-16 px-6 rounded-t-[2rem]">
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
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-navy font-black text-2xl">
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
                                                            newPerms[moduleName][actionName] = e.target.checked;
                                                            if (e.target.checked === defaultEnabled) {
                                                                delete newPerms[moduleName][actionName];
                                                                if (Object.keys(newPerms[moduleName]).length === 0) delete newPerms[moduleName];
                                                            }
                                                            setCustomPerms(newPerms);
                                                        }}
                                                        className={`rounded focus:ring-2 w-4 h-4 ${isOverridden ? 'text-amber-600 focus:ring-amber-500 border-amber-400' : 'text-navy focus:ring-navy border-slate-300'}`}
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
                            <button onClick={handleUpdatePermissions} disabled={updateLoading} className="px-6 py-3 bg-navy text-white font-black rounded-xl hover:bg-navy-hover transition flex items-center gap-2">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-0 sm:p-4">
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
                    <span className="font-mono font-black text-navy text-lg tracking-widest">{watchEmployeeCode || '—'}</span>
                  </div>
                </div>
              </div>

              <button disabled={inviting} type="submit" className="w-full bg-gradient-to-br from-slate-700 to-slate-900 text-white font-black py-4 rounded-2xl hover:from-slate-600 hover:to-slate-800 transition-all disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-slate-800/20 active:scale-95">
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
        .input-field:focus { border-color: #334155; background: white; box-shadow: 0 0 0 4px rgba(30,41,59,0.08); }
      `}</style>
    </div>
  );
}
