'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Download, Upload, Receipt, Users } from 'lucide-react';

export default function PayslipsPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const { register, handleSubmit, watch, reset, setValue } = useForm({
    resolver: zodResolver(z.object({
      employee_id: z.string().uuid().min(1, 'Employee required'),
      month: z.string().min(1, 'Month required'),
      year: z.preprocess((val) => Number(val), z.number().min(2000)),
      gross_salary: z.preprocess((val) => Number(val), z.number().min(0)),
      pf_deduction: z.preprocess((val) => Number(val) || 0, z.number().min(0).optional()),
      esi_deduction: z.preprocess((val) => Number(val) || 0, z.number().min(0).optional()),
      net_salary: z.preprocess((val) => Number(val), z.number()),
      payslip_url: z.string().min(1, 'File ID required')
    })),
    defaultValues: {
      employee_id: '', month: '', year: new Date().getFullYear(),
      gross_salary: '', pf_deduction: '', esi_deduction: '', net_salary: '', payslip_url: ''
    }
  });

  const watchGross = watch('gross_salary');
  const watchPf = watch('pf_deduction');
  const watchEsi = watch('esi_deduction');

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    if (employeeProfile) fetchPayslips();
  }, [employeeProfile]);

  // Auto-calculate Net Salary
  useEffect(() => {
    const gross = parseFloat(watchGross) || 0;
    const pf = parseFloat(watchPf) || 0;
    const esi = parseFloat(watchEsi) || 0;
    if (watchGross) {
      setValue('net_salary', (gross - pf - esi).toString(), { shouldValidate: true });
    }
  }, [watchGross, watchPf, watchEsi, setValue]);

  const fetchPayslips = async () => {
    setLoading(true);
    try {
      if (role === 'admin') {
        const [empRes, slipRes] = await Promise.all([
          supabase.from('employees').select('id, full_name').eq('is_active', true),
          supabase.from('payslips').select('*, employees(full_name)').order('created_at', { ascending: false })
        ]);
        setEmployees(empRes.data || []);
        if (slipRes.error) throw slipRes.error;
        setPayslips(slipRes.data || []);
      } else {
        const { data, error } = await supabase.from('payslips').select('*, employees(full_name)').eq('employee_id', employeeProfile.id).order('created_at', { ascending: false });
        if (error) throw error;
        setPayslips(data || []);
      }
    } catch (err) { console.error('Fetch payslips error:', err); }
    finally { setLoading(false); }
  };


  const handleUploadSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/payslips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to upload payslip');
      setShowUpload(false); reset(); fetchPayslips();
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };


  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading payslips...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Payroll & Salary Slips</h1>
          <p className="text-gray-500 mt-1">Access your monthly compensation records.</p>
        </div>
        {role === 'admin' && (
          <button onClick={() => setShowUpload(!showUpload)} className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm">
            <Upload className="w-5 h-5 mr-2" /> Upload Payslip
          </button>
        )}
      </div>

      {showUpload && role === 'admin' && (
        <form onSubmit={handleSubmit(handleUploadSubmit)} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Upload New Payslip</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Employee *</label>
              <select {...register('employee_id')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 outline-none">
                <option value="">Select teammate...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Month *</label>
              <select 
                {...register('month')}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 font-bold"
              >
                <option value="">Month...</option>
                {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Year *</label>
              <input type="number" min="2020" max="2100" {...register('year')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Gross Salary (₹) *</label>
              <input type="number" min="0" step="any" {...register('gross_salary')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">PF Deduction (₹)</label>
              <input type="number" min="0" step="any" {...register('pf_deduction')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ESI Deduction (₹)</label>
              <input type="number" min="0" step="any" {...register('esi_deduction')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Net Salary (₹) *</label>
              <input type="number" step="any" readOnly {...register('net_salary')} className="w-full px-4 py-2 bg-teal-50 font-bold text-teal-900 border border-teal-200 rounded-lg text-sm outline-none cursor-not-allowed" title="Auto-calculated from Gross - Deductions" />
            </div>
            
            <div className="lg:col-span-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Secure Google Drive File ID *</label>
              <input type="text" {...register('payslip_url')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" placeholder="paste_the_file_id_here" />
              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-widest">Files are served via secure auth-mediated proxy. Never use public URLs.</p>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 border-t border-gray-100 pt-6">
            <button type="button" onClick={() => setShowUpload(false)} className="px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button disabled={submitting} type="submit" className="px-5 py-2 text-sm font-medium text-white bg-teal-800 hover:bg-teal-900 shadow-sm rounded-lg">{submitting ? 'Uploading...' : 'Upload Payslip'}</button>
          </div>
        </form>
      )}

      {role === 'admin' && payslips.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center">
             <div className="p-3 bg-teal-100 text-teal-700 rounded-xl mr-4"><Users className="w-6 h-6" /></div>
             <div>
               <p className="text-sm font-medium text-gray-500 mb-0.5">Total Slips Issued</p>
               <p className="text-2xl font-bold text-gray-900">{payslips.length}</p>
             </div>
           </div>
           <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center">
             <div className="p-3 bg-blue-100 text-blue-700 rounded-xl mr-4"><Receipt className="w-6 h-6" /></div>
             <div>
               <p className="text-sm font-medium text-gray-500 mb-0.5">Total Payroll Configured</p>
               <p className="text-2xl font-bold text-gray-900">₹{payslips.reduce((acc, curr) => acc + parseFloat(curr.gross_salary || 0), 0).toLocaleString()}</p>
             </div>
           </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th colSpan="5" className="px-6 py-4 text-left border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">{role === 'admin' ? 'Payroll History' : 'My Payslip History'}</h2>
                </th>
              </tr>
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Month/Year</th>
                {role === 'admin' && <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Employee</th>}
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Gross Salary</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Net Salary</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {payslips.map((slip) => (
                <tr key={slip.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-teal-900 font-mono tracking-widest bg-gray-50/50">
                    {slip.month}
                  </td>
                  {role === 'admin' && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">
                      {slip.employees?.full_name}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium tracking-wide">
                    ₹{parseFloat(slip.gross_salary).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700 tracking-wide">
                    ₹{parseFloat(slip.net_salary).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <a href={`/api/files/${slip.payslip_url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-teal-700 transition-colors focus:ring-2 focus:ring-teal-500 outline-none">
                      <Download className="w-4 h-4 mr-2 text-gray-400" /> View / Download
                    </a>
                  </td>
                </tr>
              ))}
              {payslips.length === 0 && (
                <tr>
                  <td colSpan={role === 'admin' ? 5 : 4} className="px-6 py-12 text-center text-sm text-gray-500">No payslips available on record.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
