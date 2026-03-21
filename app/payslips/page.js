'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Download, Upload, Receipt, Users } from 'lucide-react';

export default function PayslipsPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  
  // Upload form state
  const [form, setForm] = useState({
    employee_id: '', month: '', year: new Date().getFullYear(),
    gross_salary: '', pf_deduction: '', esi_deduction: '', net_salary: '', payslip_url: ''
  });

  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) fetchPayslips();
  }, [employeeProfile]);

  const fetchPayslips = async () => {
    setLoading(true);
    let query = supabase.from('payslips').select('*, employees(full_name)').order('created_at', { ascending: false });
    
    if (role !== 'admin') {
      query = query.eq('employee_id', employeeProfile.id);
    } else {
      const { data: emps } = await supabase.from('employees').select('id, full_name').eq('is_active', true);
      setEmployees(emps || []);
    }

    const { data } = await query;
    setPayslips(data || []);
    setLoading(false);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    await supabase.from('payslips').insert({
      employee_id: form.employee_id,
      month: form.month,
      year: parseInt(form.year),
      gross_salary: parseFloat(form.gross_salary),
      pf_deduction: parseFloat(form.pf_deduction),
      esi_deduction: parseFloat(form.esi_deduction),
      net_salary: parseFloat(form.net_salary),
      payslip_url: form.payslip_url,
      uploaded_by: employeeProfile.id,
      uploaded_at: new Date().toISOString()
    });

    setShowUpload(false);
    setForm({
      employee_id: '', month: '', year: new Date().getFullYear(),
      gross_salary: '', pf_deduction: '', esi_deduction: '', net_salary: '', payslip_url: ''
    });
    fetchPayslips();
    
    // Notifications trigger could be added here
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
        <form onSubmit={handleUpload} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Upload New Payslip</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Employee *</label>
              <select required value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 outline-none">
                <option value="">Select teammate...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Month *</label>
              <input type="text" required value={form.month} onChange={e => setForm({...form, month: e.target.value.toUpperCase()})} placeholder="MAR-2026" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 uppercase font-mono" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Year *</label>
              <input type="number" required value={form.year} onChange={e => setForm({...form, year: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Gross Salary (₹) *</label>
              <input type="number" required value={form.gross_salary} onChange={e => setForm({...form, gross_salary: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">PF Deduction (₹)</label>
              <input type="number" required value={form.pf_deduction} onChange={e => setForm({...form, pf_deduction: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ESI Deduction (₹)</label>
              <input type="number" required value={form.esi_deduction} onChange={e => setForm({...form, esi_deduction: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Net Salary (₹) *</label>
              <input type="number" required value={form.net_salary} onChange={e => setForm({...form, net_salary: e.target.value})} className="w-full px-4 py-2 bg-teal-50 font-bold text-teal-900 border border-teal-200 rounded-lg text-sm focus:ring-teal-500" />
            </div>
            
            <div className="lg:col-span-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Payslip Document URL (Cloudinary) *</label>
              <input type="url" required value={form.payslip_url} onChange={e => setForm({...form, payslip_url: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" placeholder="https://res.cloudinary.com/.../payslip.pdf" />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 border-t border-gray-100 pt-6">
            <button type="button" onClick={() => setShowUpload(false)} className="px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-teal-800 hover:bg-teal-900 shadow-sm rounded-lg">Upload Payslip</button>
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
                    <a href={slip.payslip_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-teal-700 transition-colors focus:ring-2 focus:ring-teal-500 outline-none">
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
