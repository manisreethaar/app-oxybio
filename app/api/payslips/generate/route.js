export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

/**
 * OxyBio Leave Policy:
 * - No fixed weekly holidays. All calendar days (including Sundays) are working days.
 * - Every employee is entitled to 4 leave days per month (any day of the week).
 * - Additional formally approved leave applications are credited on top.
 * - LOP = total_calendar_days − days_present − 4_monthly_allowance − approved_leave_days
 */
const MONTHLY_LEAVE_ALLOWANCE = 4;

/** Returns the total number of calendar days between two dates (inclusive). All 7 days count. */
function getTotalCalendarDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * POST /api/payslips/generate
 * Computes the payroll for a specific employee and month.
 * Takes: { employee_id, month (name), year, pf_deduction, esi_deduction }
 * Returns: full calculated payslip data for admin review before saving.
 */
export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: adminEmp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!adminEmp || !['admin', 'ceo', 'cto'].includes(adminEmp.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { employee_id, month, year, pf_deduction = 0, esi_deduction = 0 } = await request.json();

    if (!employee_id || !month || !year) {
      return NextResponse.json({ error: 'Missing required fields: employee_id, month, year' }, { status: 400 });
    }

    // Fetch employee details including base salary, date of joining and role
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, base_salary, joined_date, designation, employee_code, role')
      .eq('id', employee_id)
      .single();

    if (empErr || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (!emp.base_salary || emp.base_salary <= 0) {
      return NextResponse.json({ error: `No base salary set for ${emp.full_name}. Please set it in Team Management first.` }, { status: 400 });
    }

    // Calculate month date boundaries
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return NextResponse.json({ error: 'Invalid month name' }, { status: 400 });

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0); // Last day of month

    // DoJ proration - if employee joined during this month, count from joined_date
    let periodStart = monthStart;
    if (emp.joined_date) {
      const doj = new Date(emp.joined_date);
      if (doj > monthStart && doj <= monthEnd) {
        periodStart = doj; // Prorate from their joining date
      } else if (doj > monthEnd) {
        // Employee had not joined yet this month
        return NextResponse.json({ error: `${emp.full_name} had not joined by ${month} ${year}` }, { status: 400 });
      }
    }

    // Count total calendar days in the period (no day is automatically excluded)
    const totalWorkingDays = getTotalCalendarDays(periodStart, monthEnd);

    // Count present days from attendance_log
    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = monthEnd.toISOString().split('T')[0];

    const { data: attendanceLogs } = await supabase
      .from('attendance_log')
      .select('date')
      .eq('employee_id', employee_id)
      .gte('date', startStr)
      .lte('date', endStr)
      .not('check_in_time', 'is', null);

    // Unique present days (in case of multiple logs per day)
    const presentDays = new Set((attendanceLogs || []).map(a => a.date)).size;

    // ── Leave Policy ──────────────────────────────────────────────────────────
    // All employees get 4 days leave per month (any day of the week — no fixed holidays).
    // Formally approved leave applications (any type) are credited on top of the 4-day allowance.
    // LOP = total_calendar_days - days_present - 4_monthly_allowance - approved_leave_days
    // ─────────────────────────────────────────────────────────────────────────

    // Prorate the monthly allowance if employee joined mid-month
    const fullMonthDays = getTotalCalendarDays(monthStart, monthEnd);
    const periodFraction = totalWorkingDays / fullMonthDays;
    const proratedAllowance = Math.round(MONTHLY_LEAVE_ALLOWANCE * periodFraction * 10) / 10;

    const { data: approvedLeaves } = await supabase
      .from('leave_applications')
      .select('total_days, leave_type')
      .eq('employee_id', employee_id)
      .eq('status', 'approved')
      .gte('start_date', startStr)
      .lte('end_date', endStr);

    const approvedLeaveDays = (approvedLeaves || []).reduce((acc, l) => acc + (l.total_days || 0), 0);

    const leavePolicyNote =
      `4 days/month leave allowance (any day) + approved leave applications credited. No fixed weekly holiday.`;

    // Calculate LOP: days unaccounted for after allowance + approved leaves
    const creditedDays = presentDays + proratedAllowance + approvedLeaveDays;
    const lopDays = Math.max(0, totalWorkingDays - creditedDays);

    // Salary Computation
    const dailyRate = emp.base_salary / totalWorkingDays;
    const lopDeduction = lopDays * dailyRate;
    const grossSalary = emp.base_salary - lopDeduction;
    const netSalary = Math.max(0, grossSalary - parseFloat(pf_deduction || 0) - parseFloat(esi_deduction || 0));

    return NextResponse.json({
      success: true,
      data: {
        employee_id,
        employee_name: emp.full_name,
        employee_code: emp.employee_code,
        designation: emp.designation,
        month,
        year,
        period_start: startStr,
        period_end: endStr,
        base_salary: emp.base_salary,
        total_working_days: totalWorkingDays,
        present_days: presentDays,
        monthly_leave_allowance: proratedAllowance,
        approved_leave_days: approvedLeaveDays,
        lop_days: Math.round(lopDays * 100) / 100,
        lop_deduction: Math.round(lopDeduction * 100) / 100,
        gross_salary: Math.round(grossSalary * 100) / 100,
        pf_deduction: parseFloat(pf_deduction || 0),
        esi_deduction: parseFloat(esi_deduction || 0),
        net_salary: Math.round(netSalary * 100) / 100,
        leave_policy_note: leavePolicyNote,
      }
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
