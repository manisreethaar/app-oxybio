'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import {
  Download, Receipt, Users, Calculator, CheckCircle, AlertTriangle,
  Loader2, ChevronDown, ChevronUp, FileText, RefreshCw, X
} from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── PDF Generator ──────────────────────────────────────────────────────────────
async function downloadPayslipPDF(slip) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  // Header band - teal
  doc.setFillColor(15, 118, 110); // teal-700
  doc.rect(0, 0, W, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Oxygen Bioinnovations Pvt. Ltd.', 14, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PAYSLIP', 14, 22);
  doc.text(`Period: ${slip.month} ${slip.year}`, 14, 28);
  doc.text('www.oxygenbioinnovations.com', W - 14, 14, { align: 'right' });

  // Employee details box
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(245, 250, 250);
  doc.roundedRect(10, 44, W - 20, 38, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Employee Name:', 16, 54);
  doc.text('Designation:', 16, 62);
  doc.text('Employee Code:', 16, 70);
  doc.text('Pay Period:', 16, 78);

  doc.setFont('helvetica', 'normal');
  doc.text(slip.employees?.full_name || slip.employee_name || '—', 60, 54);
  doc.text(slip.employees?.designation || slip.designation || '—', 60, 62);
  doc.text(slip.employees?.employee_code || slip.employee_code || '—', 60, 70);
  doc.text(`${slip.month} ${slip.year}`, 60, 78);

  // Attendance Summary
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 118, 110);
  doc.text('Attendance Summary', 14, 94);

  autoTable(doc, {
    startY: 98,
    head: [['Total Working Days', 'Days Present', 'Approved Leaves', 'LOP Days']],
    body: [[
      slip.total_working_days ?? '—',
      slip.present_days ?? '—',
      slip.approved_leave_days ?? '—',
      slip.lop_days ?? '—'
    ]],
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, halign: 'center' },
    margin: { left: 14, right: 14 },
  });

  // Earnings & Deductions
  const afterAttendance = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 118, 110);
  doc.text('Earnings & Deductions', 14, afterAttendance);

  autoTable(doc, {
    startY: afterAttendance + 4,
    head: [['Description', 'Amount (₹)']],
    body: [
      ['Base Salary', `₹${Number(slip.base_salary || 0).toLocaleString('en-IN')}`],
      ['LOP Deduction', `- ₹${Number(slip.lop_deduction || 0).toLocaleString('en-IN')}`],
      ['Gross Salary', `₹${Number(slip.gross_salary || 0).toLocaleString('en-IN')}`],
      ['PF Deduction', `- ₹${Number(slip.pf_deduction || 0).toLocaleString('en-IN')}`],
      ['ESI Deduction', `- ₹${Number(slip.esi_deduction || 0).toLocaleString('en-IN')}`],
    ],
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // NET SALARY highlight box
  const afterEarnings = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(15, 118, 110);
  doc.roundedRect(10, afterEarnings, W - 20, 14, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('NET SALARY', 16, afterEarnings + 9.5);
  doc.text(`₹${Number(slip.net_salary || 0).toLocaleString('en-IN')}`, W - 16, afterEarnings + 9.5, { align: 'right' });

  // Footer note
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a system-generated payslip and does not require a signature.', 14, afterEarnings + 28);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')} by OxyOS`, 14, afterEarnings + 33);

  const filename = `Payslip_${slip.employees?.full_name || 'Employee'}_${slip.month}_${slip.year}.pdf`;
  doc.save(filename);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PayslipsPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const isAdmin = ['admin','ceo','cto'].includes(role);

  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);

  // Generator form state
  const [genEmployee, setGenEmployee] = useState('');
  const [genMonth, setGenMonth] = useState(MONTHS[new Date().getMonth()]);
  const [genYear, setGenYear] = useState(new Date().getFullYear().toString());
  const [genPF, setGenPF] = useState('');
  const [genESI, setGenESI] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [calcError, setCalcError] = useState('');
  const [saving, setSaving] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [empRes, slipRes] = await Promise.all([
          supabase.from('employees').select('id, full_name, base_salary').eq('is_active', true).order('full_name'),
          supabase.from('payslips')
            .select('*, employees(full_name, designation, employee_code)')
            .order('created_at', { ascending: false })
        ]);
        setEmployees(empRes.data || []);
        setPayslips(slipRes.data || []);
      } else if (employeeProfile?.id) {
        const { data } = await supabase
          .from('payslips')
          .select('*, employees(full_name, designation, employee_code)')
          .eq('employee_id', employeeProfile.id)
          .order('year', { ascending: false })
          .order('created_at', { ascending: false });
        setPayslips(data || []);
      }
    } catch (err) {
      console.error('Fetch payslips error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, employeeProfile, supabase]);

  useEffect(() => {
    if (!authLoading && employeeProfile) fetchPayslips();
  }, [authLoading, employeeProfile, fetchPayslips]);

  const handleCalculate = async () => {
    if (!genEmployee || !genMonth || !genYear) return setCalcError('Please fill all required fields.');
    setCalculating(true);
    setCalcError('');
    setCalcResult(null);
    try {
      const res = await fetch('/api/payslips/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: genEmployee,
          month: genMonth,
          year: parseInt(genYear),
          pf_deduction: parseFloat(genPF) || 0,
          esi_deduction: parseFloat(genESI) || 0
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCalcResult(json.data);
    } catch (err) {
      setCalcError(err.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleApproveAndSave = async () => {
    if (!calcResult) return;
    setSaving(true);
    try {
      const res = await fetch('/api/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...calcResult,
          is_auto_generated: true,
          payslip_url: null
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCalcResult(null);
      setShowGenerator(false);
      await fetchPayslips();
      alert('✅ Payslip approved and saved!');
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            {isAdmin ? 'Payroll Management' : 'My Payslips'}
          </h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">
            {isAdmin ? 'Auto-calculate salary from attendance & generate payslips.' : 'View and download your monthly salary slips.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowGenerator(true); setCalcResult(null); setCalcError(''); }}
            className="flex items-center px-6 py-3 bg-teal-700 text-white font-black rounded-2xl hover:bg-teal-800 transition-all shadow-lg active:scale-95"
          >
            <Calculator className="w-5 h-5 mr-2" /> Generate Payslip
          </button>
        )}
      </div>

      {/* Summary Strip for Admins */}
      {isAdmin && payslips.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Total Slips Issued', value: payslips.length, icon: <Receipt className="w-5 h-5" />, color: 'teal' },
            { label: 'Total Payroll', value: `₹${payslips.reduce((a, s) => a + parseFloat(s.gross_salary || 0), 0).toLocaleString('en-IN')}`, icon: <Users className="w-5 h-5" />, color: 'blue' },
            { label: 'Auto-Generated', value: payslips.filter(s => s.is_auto_generated).length, icon: <Calculator className="w-5 h-5" />, color: 'purple' }
          ].map(tile => (
            <div key={tile.label} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-${tile.color}-50 text-${tile.color}-700`}>{tile.icon}</div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{tile.label}</p>
                <p className="text-xl font-black text-gray-800 mt-0.5">{tile.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payslips Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Period</th>
                {isAdmin && <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Employee</th>}
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Working Days</th>
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">LOP Days</th>
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Gross Salary</th>
                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Net Salary</th>
                <th className="px-6 py-4 text-center text-[11px] font-black text-gray-400 uppercase tracking-widest">Download</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {payslips.map(slip => (
                <tr key={slip.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-teal-800 font-mono tracking-widest">
                    {slip.month} {slip.year}
                    {slip.is_auto_generated && (
                      <span className="ml-2 text-[10px] bg-teal-50 text-teal-600 border border-teal-200 px-1.5 py-0.5 rounded font-bold">AUTO</span>
                    )}
                  </td>
                  {isAdmin && <td className="px-6 py-4 text-sm font-bold text-slate-700">{slip.employees?.full_name}</td>}
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{slip.total_working_days ?? '—'}</td>
                  <td className="px-6 py-4 text-sm font-bold">
                    <span className={slip.lop_days > 0 ? 'text-red-600' : 'text-green-600'}>
                      {slip.lop_days ?? '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-medium">₹{parseFloat(slip.gross_salary || 0).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-sm font-black text-green-700">₹{parseFloat(slip.net_salary || 0).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => downloadPayslipPDF(slip)}
                      className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-600 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
              {payslips.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-16 text-center">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400 font-medium">No payslips available yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generator Modal (Admin only) */}
      {isAdmin && showGenerator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-black text-slate-800">Generate Payslip</h2>
                <p className="text-sm text-gray-400 mt-0.5">Auto-calculated from Attendance module</p>
              </div>
              <button onClick={() => { setShowGenerator(false); setCalcResult(null); }} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-all">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Employee Select */}
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Employee *</label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-400 focus:outline-none"
                  value={genEmployee}
                  onChange={e => { setGenEmployee(e.target.value); setCalcResult(null); }}
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} {emp.base_salary ? `(₹${emp.base_salary.toLocaleString('en-IN')}/mo)` : '⚠️ No Salary Set'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month & Year */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Month *</label>
                  <select
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-400 focus:outline-none"
                    value={genMonth}
                    onChange={e => { setGenMonth(e.target.value); setCalcResult(null); }}
                  >
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Year *</label>
                  <input
                    type="number" min="2024" max="2099"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-400 focus:outline-none"
                    value={genYear}
                    onChange={e => { setGenYear(e.target.value); setCalcResult(null); }}
                  />
                </div>
              </div>

              {/* Deductions (manual verify) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">PF Deduction (₹)</label>
                  <input
                    type="number" min="0" placeholder="0"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-400 focus:outline-none"
                    value={genPF}
                    onChange={e => { setGenPF(e.target.value); setCalcResult(null); }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">ESI Deduction (₹)</label>
                  <input
                    type="number" min="0" placeholder="0"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-400 focus:outline-none"
                    value={genESI}
                    onChange={e => { setGenESI(e.target.value); setCalcResult(null); }}
                  />
                </div>
              </div>

              {/* Error */}
              {calcError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold text-red-700">{calcError}</p>
                </div>
              )}

              {/* Calculate Button */}
              {!calcResult && (
                <button
                  onClick={handleCalculate}
                  disabled={calculating}
                  className="w-full py-4 bg-teal-700 text-white font-black rounded-2xl hover:bg-teal-800 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg"
                >
                  {calculating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calculator className="w-5 h-5" />}
                  {calculating ? 'Calculating...' : 'Calculate from Attendance'}
                </button>
              )}

              {/* Calculated Result Review */}
              {calcResult && (
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-teal-600" />
                    <span className="font-black text-teal-800 text-sm">Calculation Complete — Review Before Approving</span>
                  </div>

                  {calcResult.leave_policy_note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-700 flex items-center gap-2">
                      <span>📋 Leave Policy:</span>
                      <span className="font-medium">{calcResult.leave_policy_note}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Total Working Days', calcResult.total_working_days],
                      ['Days Present', calcResult.present_days],
                      ['Approved Leaves', calcResult.approved_leave_days],
                      ['LOP Days', calcResult.lop_days],
                      ['Base Salary', `₹${calcResult.base_salary?.toLocaleString('en-IN')}`],
                      ['LOP Deduction', `- ₹${calcResult.lop_deduction?.toLocaleString('en-IN')}`],
                      ['Gross Salary', `₹${calcResult.gross_salary?.toLocaleString('en-IN')}`],
                      ['PF Deduction', `- ₹${calcResult.pf_deduction?.toLocaleString('en-IN')}`],
                      ['ESI Deduction', `- ₹${calcResult.esi_deduction?.toLocaleString('en-IN')}`],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between items-center bg-white rounded-xl px-3 py-2 border border-teal-100">
                        <span className="text-xs text-gray-500 font-bold">{label}</span>
                        <span className="font-mono font-black text-slate-800 text-xs">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* NET SALARY Highlight */}
                  <div className="bg-teal-700 rounded-2xl px-5 py-4 flex items-center justify-between">
                    <span className="text-white font-black tracking-widest text-sm">NET SALARY</span>
                    <span className="text-white font-black text-xl font-mono">₹{calcResult.net_salary?.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setCalcResult(null); setCalcError(''); }}
                      className="flex-1 py-3 bg-gray-100 text-gray-600 font-black rounded-xl text-sm hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> Recalculate
                    </button>
                    <button
                      onClick={handleApproveAndSave}
                      disabled={saving}
                      className="flex-2 py-3 px-6 bg-green-600 text-white font-black rounded-xl text-sm hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      {saving ? 'Saving...' : 'Approve & Save Payslip'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
