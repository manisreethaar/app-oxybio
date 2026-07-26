'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  Download, Receipt, Users, Calculator, CheckCircle, AlertTriangle,
  Loader2, FileText, RefreshCw, X, ChevronLeft, ChevronRight,
  Clock, Calendar, TrendingUp, Edit3, Save, Star, MapPin,
  User, BadgeCheck, AlertCircle, ArrowLeft, Trash2
} from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── PDF Generator ──────────────────────────────────────────────────────────────
async function downloadPayslipPDF(slip) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('Oxygen Bioinnovations Pvt. Ltd.', 14, 15);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('SALARY SLIP', 14, 23);
  doc.text(`Period: ${slip.month} ${slip.year}`, 14, 30);
  doc.text('www.oxygenbioinnovations.com', W - 14, 15, { align: 'right' });

  doc.setTextColor(30, 30, 30);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, 46, W - 20, 40, 3, 3, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  ['Employee Name:', 'Designation:', 'Employee Code:', 'Pay Period:'].forEach((label, i) => {
    doc.text(label, 16, 56 + i * 8);
  });
  doc.setFont('helvetica', 'normal');
  [
    slip.employees?.full_name || slip.employee_name || '—',
    slip.employees?.designation || slip.designation || '—',
    slip.employees?.employee_code || slip.employee_code || '—',
    `${slip.month} ${slip.year}`,
  ].forEach((val, i) => doc.text(val, 65, 56 + i * 8));

  const afterHeader = 94;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('Attendance Summary', 14, afterHeader);
  autoTable(doc, {
    startY: afterHeader + 4,
    head: [['Working Days', 'Days Present', 'Approved Leaves', 'LOP Days', 'Hrs Worked']],
    body: [[
      slip.total_working_days ?? '—',
      slip.present_days ?? '—',
      slip.approved_leave_days ?? '—',
      slip.lop_days ?? '—',
      slip.total_hours_worked ? `${slip.total_hours_worked}h` : '—',
    ]],
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 9, halign: 'center' },
    margin: { left: 14, right: 14 },
  });

  const afterAtt = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('Earnings & Deductions', 14, afterAtt);
  autoTable(doc, {
    startY: afterAtt + 4,
    head: [['Description', 'Amount (₹)']],
    body: [
      ['Base Salary', `₹${Number(slip.base_salary || 0).toLocaleString('en-IN')}`],
      ['LOP Deduction', `- ₹${Number(slip.lop_deduction || 0).toLocaleString('en-IN')}`],
      ['Gross Salary', `₹${Number(slip.gross_salary || 0).toLocaleString('en-IN')}`],
      ['PF Deduction', `- ₹${Number(slip.pf_deduction || 0).toLocaleString('en-IN')}`],
      ['ESI Deduction', `- ₹${Number(slip.esi_deduction || 0).toLocaleString('en-IN')}`],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  const afterEarn = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(10, afterEarn, W - 20, 14, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('NET SALARY', 16, afterEarn + 9.5);
  doc.text(`₹${Number(slip.net_salary || 0).toLocaleString('en-IN')}`, W - 16, afterEarn + 9.5, { align: 'right' });

  if (slip.admin_notes) {
    doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.text(`Note: ${slip.admin_notes}`, 14, afterEarn + 28);
  }
  doc.setTextColor(160, 160, 160); doc.setFontSize(7);
  doc.text('This is a system-generated payslip and does not require a signature.', 14, afterEarn + 36);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')} by OxyOS`, 14, afterEarn + 41);

  doc.save(`Payslip_${slip.employees?.full_name || 'Employee'}_${slip.month}_${slip.year}.pdf`);
}

// ── Status badge helper ────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    present:      { label: 'Present',  cls: 'bg-emerald-100 text-emerald-700' },
    absent:       { label: 'Absent',   cls: 'bg-red-100 text-red-600' },
    on_leave:     { label: 'Leave',    cls: 'bg-amber-100 text-amber-700' },
    leave_pending:{ label: 'Pending',  cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    not_applicable: { label: '—',      cls: 'bg-slate-50 text-slate-300' },
  };
  const { label, cls } = map[status] || { label: status, cls: '' };
  return <span className={`text-xs font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ── Calendar Day Cell ──────────────────────────────────────────────────────────
function DayCell({ dayData }) {
  const { date, status, log, leave, is_joining_day, is_sunday } = dayData;
  const d = new Date(date + 'T00:00:00');
  const dayNum = d.getDate();
  const isToday = date === new Date().toISOString().split('T')[0];

  const bgMap = {
    present:       log && (!log.check_out_time || log.mispunch_status === 'required') ? 'bg-red-50/30 border-red-300' : 'bg-emerald-50 border-emerald-200',
    absent:        'bg-red-50/60 border-red-100',
    on_leave:      'bg-amber-50 border-amber-200',
    leave_pending: 'bg-slate-50 border-slate-100',
    not_applicable:'bg-white border-slate-50',
  };

  return (
    <div className={`relative rounded-2xl border p-2 min-h-[80px] flex flex-col gap-1 transition-all overflow-hidden ${bgMap[status] || 'bg-white border-slate-100'} ${isToday ? 'ring-2 ring-slate-400' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <span className={`text-xs font-black shrink-0 ${status === 'not_applicable' ? 'text-slate-200' : is_sunday && status !== 'present' ? 'text-slate-400' : 'text-slate-700'}`}>
            {dayNum}
          </span>
          {is_sunday && (
            <span className={`text-xs font-bold truncate ${status === 'not_applicable' ? 'text-slate-200' : status === 'present' ? 'text-emerald-600/50' : 'text-slate-300'}`}>Sun</span>
          )}
        </div>
        {is_joining_day && <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />}
        {isToday && <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />}
      </div>

      {status === 'present' && log && (
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-emerald-700 font-mono whitespace-nowrap">
              {new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          </div>
          {log.check_out_time && log.mispunch_status !== 'required' ? (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              <span className="text-xs font-bold text-slate-500 font-mono whitespace-nowrap">
                {new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-1 min-w-0">
              <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
              <span className="text-xs font-black text-red-600 uppercase tracking-widest truncate">Missed</span>
            </div>
          )}
          {log.total_hours && (
            <span className="block text-xs font-black text-slate-600 mt-0.5 whitespace-nowrap">
              {log.total_hours}h
            </span>
          )}
          {log.manual_entry && (
            <span className="block text-xs font-black text-slate-500 uppercase tracking-wide truncate">Manual</span>
          )}
        </div>
      )}

      {(status === 'on_leave' || status === 'leave_pending') && leave && (
        <span className="text-xs font-black text-amber-600 leading-tight truncate block">{leave.leave_type}</span>
      )}
    </div>
  );
}

// ── Calendar Day Row (mobile agenda view) ─────────────────────────────────────
// A 7-column grid gives each day ~45px on a phone — not enough room for
// "HH:MM" check-in/out text. Below `sm`, show a full-width row per day instead.
function DayAgendaRow({ dayData }) {
  const { date, status, log, leave, is_joining_day, is_sunday } = dayData;
  const d = new Date(date + 'T00:00:00');
  const dayNum = d.getDate();
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const isToday = date === new Date().toISOString().split('T')[0];

  const bgMap = {
    present:       log && (!log.check_out_time || log.mispunch_status === 'required') ? 'bg-red-50/30 border-red-300' : 'bg-emerald-50 border-emerald-200',
    absent:        'bg-red-50/60 border-red-100',
    on_leave:      'bg-amber-50 border-amber-200',
    leave_pending: 'bg-slate-50 border-slate-100',
    not_applicable:'bg-white border-slate-50',
  };

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${bgMap[status] || 'bg-white border-slate-100'} ${isToday ? 'ring-2 ring-slate-400' : ''}`}>
      <div className="flex flex-col items-center w-9 shrink-0">
        <span className={`text-[10px] font-black uppercase ${status === 'not_applicable' ? 'text-slate-200' : is_sunday ? 'text-slate-300' : 'text-slate-400'}`}>{weekday}</span>
        <span className={`text-base font-black ${status === 'not_applicable' ? 'text-slate-300' : 'text-slate-800'}`}>{dayNum}</span>
      </div>

      <div className="flex-1 min-w-0">
        {status === 'present' && log ? (
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-xs font-bold font-mono">
            <span className="text-emerald-700">{fmtTime(log.check_in_time)}</span>
            {log.check_out_time && log.mispunch_status !== 'required' ? (
              <>
                <span className="text-slate-300">&rarr;</span>
                <span className="text-slate-500">{fmtTime(log.check_out_time)}</span>
              </>
            ) : (
              <span className="flex items-center gap-1 text-red-600 font-black uppercase text-[10px] tracking-wide font-sans">
                <AlertTriangle className="w-3 h-3 shrink-0" /> Missed checkout
              </span>
            )}
          </div>
        ) : status === 'on_leave' || status === 'leave_pending' ? (
          <span className="text-xs font-black text-amber-600">{leave?.leave_type || 'Leave'}</span>
        ) : status === 'absent' ? (
          <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Absent</span>
        ) : is_sunday ? (
          <span className="text-xs font-medium text-slate-300">Sunday</span>
        ) : (
          <span className="text-xs font-medium text-slate-300">&mdash;</span>
        )}
        {log?.manual_entry && <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wide mt-0.5">Manual Entry</span>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {is_joining_day && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />}
        {status === 'present' && log?.total_hours && (
          <span className="text-xs font-black text-slate-700 tabular-nums">{log.total_hours}h</span>
        )}
      </div>
    </div>
  );
}

// ── Attendance Calendar ────────────────────────────────────────────────────────
function AttendanceCalendar({ calendarDays, summary, month, year, onPrev, onNext, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Build grid: pad start for day-of-week alignment (Mon first)
  const firstDay = calendarDays[0];
  const firstDOW = firstDay ? new Date(firstDay.date + 'T00:00:00').getDay() : 0;
  // We want Monday=0 grid, so offset = (Sun=0→6, Mon=1→0, Tue=2→1, ...)
  const padCount = firstDOW === 0 ? 6 : firstDOW - 1;

  return (
    <div className="space-y-4">
      {/* Month Nav */}
      <div className="flex items-center justify-between">
        <button onClick={onPrev} className="p-2 rounded-xl hover:bg-slate-100 transition-all">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h3 className="text-lg font-black text-slate-800">{MONTHS[month - 1]} {year}</h3>
        <button onClick={onNext} className="p-2 rounded-xl hover:bg-slate-100 transition-all">
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {[
          { color: 'bg-emerald-400', label: 'Present' },
          { color: 'bg-red-400',    label: 'Absent' },
          { color: 'bg-amber-400',  label: 'On Leave' },
          { color: 'bg-slate-400',   label: 'Leave Pending' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
            <span className="text-xs font-bold text-slate-500">{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
          <span className="text-xs font-bold text-slate-500">Joining Day</span>
        </div>
      </div>

      {/* Mobile: vertical agenda list — a 7-col grid has no room for full check-in/out times on a phone */}
      <div className="sm:hidden space-y-1.5">
        {calendarDays.map(day => (
          <DayAgendaRow key={day.date} dayData={day} />
        ))}
      </div>

      {/* Tablet/desktop: 7-column calendar grid */}
      <div className="hidden sm:grid grid-cols-7 gap-1.5">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className={`text-center text-xs font-black uppercase tracking-widest py-1 ${d === 'Sun' ? 'text-slate-300' : 'text-slate-400'}`}>
            {d}
          </div>
        ))}

        {/* Padding cells */}
        {Array.from({ length: padCount }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-[80px]" />
        ))}

        {/* Actual day cells */}
        {calendarDays.map(day => (
          <DayCell key={day.date} dayData={day} />
        ))}
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3 pt-2">
          {[
            { label: 'Working Days', value: summary.total_working_days, color: 'text-slate-700' },
            { label: 'Present',      value: summary.present_days,       color: 'text-emerald-600' },
            { label: 'Absent',       value: summary.absent_days,        color: 'text-red-500' },
            { label: 'Allowance',    value: summary.monthly_leave_allowance, color: 'text-slate-600' },
            { label: 'On Leave',     value: summary.leave_days,         color: 'text-amber-600' },
            { label: 'LOP Days',     value: summary.lop_days,           color: 'text-red-600' },
            { label: 'Total Hours',  value: `${summary.total_hours_worked}h`, color: 'text-slate-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 px-3 py-3 text-center shadow-sm">
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Payslip Generator / Editor Panel ──────────────────────────────────────────
function PayslipPanel({
  employee, summary, month, year, monthLabel,
  existingSlip, onSaved, onDeleted, onClose
}) {
  const toast = useToast();
  const [pfDed, setPfDed]   = useState(existingSlip?.pf_deduction ?? 0);
  const [esiDed, setEsiDed] = useState(existingSlip?.esi_deduction ?? 0);
  const [lopOverride, setLopOverride] = useState(
    existingSlip?.override_lop_days ?? existingSlip?.lop_days ?? summary?.lop_days ?? 0
  );
  const [adminNotes, setAdminNotes] = useState(existingSlip?.admin_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(!existingSlip);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this payslip? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payslips/${existingSlip.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Payslip deleted successfully.');
      onDeleted();
    } catch (err) {
      toast.error('Failed to delete payslip: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const baseSalary = employee?.base_salary || 0;

  // Live recalculation
  const calc = useMemo(() => {
    if (!summary) return null;
    const lop = parseFloat(lopOverride) || 0;
    const totalDays = summary.total_working_days || 1;
    const dailyRate = baseSalary / totalDays;
    const lopDed   = lop * dailyRate;
    const gross    = Math.max(0, baseSalary - lopDed);
    const net      = Math.max(0, gross - parseFloat(pfDed || 0) - parseFloat(esiDed || 0));
    return {
      base_salary: baseSalary,
      total_working_days: totalDays,
      present_days: summary.present_days,
      approved_leave_days: summary.leave_days,
      lop_days: lop,
      lop_deduction: Math.round(lopDed * 100) / 100,
      gross_salary: Math.round(gross * 100) / 100,
      pf_deduction: parseFloat(pfDed || 0),
      esi_deduction: parseFloat(esiDed || 0),
      net_salary: Math.round(net * 100) / 100,
    };
  }, [baseSalary, lopOverride, pfDed, esiDed, summary]);

  const handleSave = async () => {
    if (!calc) return;
    setSaving(true);
    try {
      if (existingSlip && isEditing) {
        // Edit existing
        const res = await fetch(`/api/payslips/${existingSlip.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pf_deduction: calc.pf_deduction,
            esi_deduction: calc.esi_deduction,
            override_lop_days: calc.lop_days,
            lop_deduction: calc.lop_deduction,
            gross_salary: calc.gross_salary,
            net_salary: calc.net_salary,
            admin_notes: adminNotes || null,
          })
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Payslip updated successfully.');
      } else {
        // Create new
        const MONTHS_ARR = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const res = await fetch('/api/payslips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: employee.id,
            month: MONTHS_ARR[month - 1],
            year,
            base_salary: calc.base_salary,
            total_working_days: calc.total_working_days,
            present_days: calc.present_days,
            approved_leave_days: calc.approved_leave_days,
            lop_days: calc.lop_days,
            lop_deduction: calc.lop_deduction,
            gross_salary: calc.gross_salary,
            pf_deduction: calc.pf_deduction,
            esi_deduction: calc.esi_deduction,
            net_salary: calc.net_salary,
            total_hours_worked: summary?.total_hours_worked,
            admin_notes: adminNotes || null,
            is_auto_generated: true,
            payslip_url: null,
          })
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Payslip approved & saved! Employee notified.');
      }
      onSaved();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
        <AlertCircle className="w-8 h-8 text-slate-300" />
        <p className="text-sm font-bold text-slate-400">Select a month with attendance data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
            {existingSlip ? (isEditing ? 'Editing Payslip' : 'Payslip Issued') : 'Generate Payslip'}
          </p>
          <p className="text-base font-black text-slate-800">{monthLabel} {year}</p>
        </div>
        {existingSlip && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {/* Attendance snapshot */}
      <div className="bg-slate-50 rounded-2xl p-3 grid grid-cols-2 gap-2">
        {[
          ['Working Days', summary.total_working_days],
          ['Present', summary.present_days],
          ['Allowance', summary.monthly_leave_allowance],
          ['Leave Days', summary.leave_days],
          ['Total Hours', `${summary.total_hours_worked}h`],
        ].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl px-3 py-2 border border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</p>
            <p className="text-sm font-black text-slate-800 mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      {/* Override controls */}
      <div className={`space-y-3 transition-opacity ${!isEditing && existingSlip ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Admin Controls</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">LOP Days Override</label>
            <input
              type="number" min="0" step="0.5"
              value={lopOverride}
              onChange={e => setLopOverride(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-center focus:ring-2 focus:ring-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">PF Deduction (₹)</label>
            <input
              type="number" min="0"
              value={pfDed}
              onChange={e => setPfDed(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-center focus:ring-2 focus:ring-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">ESI Deduction (₹)</label>
            <input
              type="number" min="0"
              value={esiDed}
              onChange={e => setEsiDed(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-center focus:ring-2 focus:ring-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Admin Notes</label>
            <input
              type="text"
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              placeholder="Optional note"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Live calculation */}
      {calc && (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Calculation</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              ['Base Salary', `₹${calc.base_salary.toLocaleString('en-IN')}`, ''],
              ['LOP Deduction', `- ₹${calc.lop_deduction.toLocaleString('en-IN')}`, 'text-red-500'],
              ['Gross Salary', `₹${calc.gross_salary.toLocaleString('en-IN')}`, 'font-black text-slate-700'],
              ['PF Deduction', `- ₹${calc.pf_deduction.toLocaleString('en-IN')}`, 'text-red-400'],
              ['ESI Deduction', `- ₹${calc.esi_deduction.toLocaleString('en-IN')}`, 'text-red-400'],
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between items-center px-4 py-2.5">
                <span className="text-xs font-bold text-slate-500">{label}</span>
                <span className={`text-xs font-mono font-black ${cls}`}>{val}</span>
              </div>
            ))}
          </div>
          <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
            <span className="text-white font-black text-sm tracking-widest">NET SALARY</span>
            <span className="text-white font-black text-xl font-mono">₹{calc.net_salary.toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {(isEditing || !existingSlip) && (
        <div className="flex gap-2">
          {existingSlip && (
            <button
              onClick={() => { setIsEditing(false); setPfDed(existingSlip.pf_deduction ?? 0); setEsiDed(existingSlip.esi_deduction ?? 0); setLopOverride(existingSlip.lop_days ?? summary?.lop_days ?? 0); setAdminNotes(existingSlip.admin_notes ?? ''); }}
              className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-3 bg-slate-800 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-900 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving...' : existingSlip ? 'Save Changes' : 'Approve & Issue'}
          </button>
        </div>
      )}

      {existingSlip && !isEditing && (
        <div className="flex gap-2">
          <button
            onClick={() => downloadPayslipPDF({ ...existingSlip })}
            className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-3 bg-red-50 text-red-600 font-black rounded-2xl text-xs hover:bg-red-100 transition-all flex items-center justify-center shrink-0"
            title="Delete Payslip"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Employee List Item ─────────────────────────────────────────────────────────
function EmployeeItem({ emp, isSelected, onClick }) {
  const initials = emp.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const roleColors = {
    admin: 'bg-slate-100 text-slate-700',
    ceo:   'bg-slate-800 text-white',
    cto:   'bg-slate-700 text-white',
    staff: 'bg-slate-100 text-slate-700',
    intern: 'bg-amber-100 text-amber-700',
    research_intern: 'bg-amber-100 text-amber-700',
    research_fellow: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left ${
        isSelected ? 'bg-slate-800 text-white shadow-lg' : 'bg-white hover:bg-slate-50 border border-slate-100'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-black truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{emp.full_name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest truncate max-w-[130px] sm:max-w-none ${isSelected ? 'bg-white/20 text-white' : (roleColors[emp.role] || 'bg-slate-100 text-slate-600')}`}>
            {emp.role?.replace(/_/g, ' ')}
          </span>
          {emp.base_salary ? (
            <span className={`text-xs font-bold whitespace-nowrap shrink-0 ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
              ₹{Number(emp.base_salary).toLocaleString('en-IN')}
            </span>
          ) : (
            <span className="text-xs font-bold text-red-400 whitespace-nowrap shrink-0">No salary</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const now = useMemo(() => new Date(), []);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [payslips, setPayslips] = useState([]);       // all payslips (admin) or own (staff)
  const [loadingInit, setLoadingInit] = useState(true);

  // Calendar state
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-12
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  // Mobile: which panel is shown
  const [mobilePanel, setMobilePanel] = useState('roster'); // 'roster' | 'calendar' | 'payslip'

  const supabase = useMemo(() => createClient(), []);

  // ── Fetch employees & payslips on mount ──────────────────────────────────────
  const fetchInitial = useCallback(async () => {
    setLoadingInit(true);
    try {
      if (isAdmin) {
        const [empRes, slipRes] = await Promise.all([
          supabase.from('employees')
            .select('id, full_name, base_salary, role, joined_date, designation, employee_code, department, is_active')
            .eq('is_active', true)
            .order('full_name'),
          supabase.from('payslips')
            .select('*, employees!payslips_employee_id_fkey(full_name, designation, employee_code)')
            .order('year', { ascending: false })
            .order('created_at', { ascending: false })
        ]);
        setEmployees(empRes.data || []);
        setPayslips(slipRes.data || []);
      } else if (employeeProfile?.id) {
        const { data } = await supabase
          .from('payslips')
          .select('*, employees!payslips_employee_id_fkey(full_name, designation, employee_code)')
          .eq('employee_id', employeeProfile.id)
          .order('year', { ascending: false })
          .order('created_at', { ascending: false });
        setPayslips(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingInit(false);
    }
  }, [isAdmin, employeeProfile, supabase]);

  useEffect(() => {
    if (!authLoading) fetchInitial();
  }, [authLoading, fetchInitial]);

  // ── Fetch attendance detail when employee/month changes ──────────────────────
  const fetchCalendarData = useCallback(async (empId, month, year) => {
    setCalLoading(true);
    setCalData(null);
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const res = await fetch(`/api/payroll/attendance-detail?employee_id=${empId}&month=${monthStr}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCalData(json.data);
    } catch (err) {
      toast.error('Failed to load attendance: ' + err.message);
    } finally {
      setCalLoading(false);
    }
  }, [toast]);

  // When employee selected → load calendar for current month
  const handleSelectEmployee = useCallback((emp) => {
    setSelectedEmployee(emp);
    setCalMonth(now.getMonth() + 1);
    setCalYear(now.getFullYear());
    fetchCalendarData(emp.id, now.getMonth() + 1, now.getFullYear());
    fetchCalendarData(emp.id, now.getMonth() + 1, now.getFullYear());
    setMobilePanel('calendar');
  }, [fetchCalendarData, now]);

  // Month navigation
  const handlePrevMonth = () => {
    let m = calMonth - 1, y = calYear;
    if (m < 1) { m = 12; y--; }
    setCalMonth(m); setCalYear(y);
    if (selectedEmployee) fetchCalendarData(selectedEmployee.id, m, y);
  };
  const handleNextMonth = () => {
    let m = calMonth + 1, y = calYear;
    if (m > 12) { m = 1; y++; }
    // Don't allow future months
    const target = new Date(y, m - 1, 1);
    if (target > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    setCalMonth(m); setCalYear(y);
    if (selectedEmployee) fetchCalendarData(selectedEmployee.id, m, y);
  };

  const empPayslips = useMemo(() => {
    if (!selectedEmployee) return [];
    return payslips.filter(s => s.employee_id === selectedEmployee.id);
  }, [payslips, selectedEmployee]);

  const currentMonthPayslip = useMemo(() => {
    if (!selectedEmployee) return null;
    return empPayslips.find(s =>
      s.year === calYear &&
      s.month === MONTHS[calMonth - 1]
    ) || null;
  }, [empPayslips, selectedEmployee, calYear, calMonth]);

  const handlePayslipSaved = () => {
    fetchInitial(); // React will re-evaluate empPayslips automatically
  };

  // ── Non-admin view ────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">My Payslips</h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">View and download your monthly salary slips.</p>
        </div>

        {loadingInit ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : payslips.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm font-bold text-slate-400">No payslips issued yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Period', 'Working Days', 'LOP Days', 'Gross', 'Net Salary', ''].map(h => (
                      <th key={h} className="px-5 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payslips.map(slip => (
                    <tr key={slip.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-mono font-black text-slate-700 text-sm">
                        {slip.month} {slip.year}
                        {slip.is_auto_generated && <span className="ml-2 text-xs bg-slate-50 text-slate-500 border px-1.5 py-0.5 rounded font-bold">AUTO</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500 font-mono">{slip.total_working_days ?? '—'}</td>
                      <td className="px-5 py-4 text-sm font-black">
                        <span className={slip.lop_days > 0 ? 'text-red-500' : 'text-emerald-600'}>{slip.lop_days ?? '—'}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">₹{Number(slip.gross_salary || 0).toLocaleString('en-IN')}</td>
                      <td className="px-5 py-4 text-sm font-black text-emerald-700">₹{Number(slip.net_salary || 0).toLocaleString('en-IN')}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => downloadPayslipPDF(slip)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────────
  if (authLoading || loadingInit) {
    return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-20 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Payroll Hub</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Attendance-driven payslip generation & management</p>
        </div>
        {/* Summary chips */}
        <div className="hidden md:flex items-center gap-3">
          {[
            { label: 'Employees', value: employees.length, icon: <Users className="w-4 h-4" /> },
            { label: 'Slips Issued', value: payslips.length, icon: <Receipt className="w-4 h-4" /> },
            { label: 'Total Payroll', value: `₹${payslips.reduce((a, s) => a + parseFloat(s.gross_salary || 0), 0).toLocaleString('en-IN')}`, icon: <TrendingUp className="w-4 h-4" /> },
          ].map(chip => (
            <div key={chip.label} className="flex items-center gap-2 bg-white border border-slate-100 rounded-2xl px-4 py-2.5 shadow-sm">
              <span className="text-slate-500">{chip.icon}</span>
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{chip.label}</p>
                <p className="text-sm font-black text-slate-800">{chip.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex md:hidden gap-1 bg-slate-100 rounded-2xl p-1">
        {[['roster','Team'], ['calendar','Calendar'], ['payslip','Payslip']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobilePanel(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mobilePanel === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 3-panel layout */}
      <div className="flex gap-4 items-start">

        {/* ── Panel A: Employee Roster ── */}
        <div className={`${mobilePanel === 'roster' ? 'flex' : 'hidden'} md:flex flex-col gap-2 w-full md:w-64 shrink-0`}>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Team ({employees.length})</p>
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto pr-1 pb-10 custom-scrollbar">
            <div className="space-y-6 mt-4">
              {/* Management Group */}
              {employees.some(e => ['admin', 'ceo', 'cto'].includes(e.role)) && (
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 mb-3">Management</p>
                  {employees.filter(e => ['admin', 'ceo', 'cto'].includes(e.role)).map(emp => (
                    <EmployeeItem 
                      key={emp.id} 
                      emp={emp} 
                      isSelected={selectedEmployee?.id === emp.id} 
                      onClick={() => handleSelectEmployee(emp)} 
                    />
                  ))}
                </div>
              )}

              {/* Scientists Group */}
              {employees.some(e => ['scientist', 'research_fellow'].includes(e.role)) && (
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 mb-3">Scientists & Researchers</p>
                  {employees.filter(e => ['scientist', 'research_fellow'].includes(e.role)).map(emp => (
                    <EmployeeItem 
                      key={emp.id} 
                      emp={emp} 
                      isSelected={selectedEmployee?.id === emp.id} 
                      onClick={() => handleSelectEmployee(emp)} 
                    />
                  ))}
                </div>
              )}

              {/* Staff & Interns Group */}
              {employees.some(e => ['staff', 'intern', 'research_intern'].includes(e.role)) && (
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 mb-3">Staff & Interns</p>
                  {employees.filter(e => ['staff', 'intern', 'research_intern'].includes(e.role)).map(emp => (
                    <EmployeeItem 
                      key={emp.id} 
                      emp={emp} 
                      isSelected={selectedEmployee?.id === emp.id} 
                      onClick={() => handleSelectEmployee(emp)} 
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Panel B: Attendance Calendar ── */}
        <div className={`${mobilePanel === 'calendar' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 md:p-6`}>
          {!selectedEmployee ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center">
                <Users className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-base font-black text-slate-400">Select an employee</p>
              <p className="text-sm text-slate-300 font-medium">Choose from the team roster to view attendance calendar</p>
            </div>
          ) : (
            <>
              {/* Employee header */}
              <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
                <div className="w-11 h-11 bg-slate-800 rounded-2xl flex items-center justify-center text-white font-black text-sm">
                  {selectedEmployee.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                </div>
                <div className="flex-1">
                  <p className="font-black text-slate-800">{selectedEmployee.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-400 font-bold">{selectedEmployee.designation || selectedEmployee.role}</p>
                    {selectedEmployee.joined_date && (
                      <span className="text-xs font-black text-slate-300 uppercase tracking-widest">
                        DOJ: {new Date(selectedEmployee.joined_date).toLocaleDateString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Base Salary</p>
                  <p className="text-sm font-black text-slate-800">₹{Number(selectedEmployee.base_salary || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>

              <AttendanceCalendar
                calendarDays={calData?.calendar_days || []}
                summary={calData?.summary}
                month={calMonth}
                year={calYear}
                onPrev={handlePrevMonth}
                onNext={handleNextMonth}
                loading={calLoading}
              />

              {/* Payslip history for this employee */}
              {empPayslips.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Issued Payslips</p>
                  <div className="flex flex-wrap gap-2">
                    {empPayslips.map(slip => (
                      <button
                        key={slip.id}
                        onClick={() => {
                          const mIdx = MONTHS.indexOf(slip.month);
                          if (mIdx !== -1) {
                            setCalMonth(mIdx + 1);
                            setCalYear(slip.year);
                            fetchCalendarData(selectedEmployee.id, mIdx + 1, slip.year);
                          }
                          setMobilePanel('payslip');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-black hover:bg-emerald-100 transition-all"
                      >
                        <BadgeCheck className="w-3 h-3" />
                        {slip.month} {slip.year}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Panel C: Payslip Generator ── */}
        <div className={`${mobilePanel === 'payslip' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 shrink-0 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5`}>
          {!selectedEmployee ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Calculator className="w-10 h-10 text-slate-200" />
              <p className="text-sm font-black text-slate-400">No employee selected</p>
            </div>
          ) : (
            <PayslipPanel
              key={`${selectedEmployee.id}-${calMonth}-${calYear}-${currentMonthPayslip?.id || 'new'}`}
              employee={selectedEmployee}
              summary={calData?.summary}
              month={calMonth}
              year={calYear}
              monthLabel={MONTHS[calMonth - 1]}
              existingSlip={currentMonthPayslip}
              onSaved={handlePayslipSaved}
              onDeleted={handlePayslipSaved}
              onClose={() => setMobilePanel('calendar')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
