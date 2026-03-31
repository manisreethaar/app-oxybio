import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// Roles that get only Casual Leave on the DOJ-based accrual system
const CL_ONLY_ROLES = ['intern', 'research_intern', 'research_fellow'];

/**
 * Calculates how many CL days an employee has EARNED so far in the current calendar year.
 *
 * Policy:
 * - On DOJ:         6 CL credited upfront (covers the first 6 months)
 * - Months 1-6:     No additional CL
 * - After 6 months: 1 CL on the 1st of each subsequent month
 * - Calendar year:  Balances reset on Jan 1. No carry-forward.
 * - Subsequent yrs: 1 CL on Jan 1st + 1 on 1st of each month thereafter
 */
function calculateEarnedCL(joinedDate, today = new Date()) {
  const doj = new Date(joinedDate);
  const currentYear = today.getFullYear();
  const dojYear = doj.getFullYear();

  if (dojYear === currentYear) {
    // First year of employment — start with 6 CL on DOJ
    let earned = 6;

    // 6-month anniversary date
    const sixMonthMark = new Date(doj.getFullYear(), doj.getMonth() + 6, doj.getDate());

    if (today >= sixMonthMark) {
      // Monthly CL starts on the 1st of the month AFTER the 6-month mark
      let firstMonthly = new Date(sixMonthMark.getFullYear(), sixMonthMark.getMonth() + 1, 1);
      while (firstMonthly <= today && firstMonthly.getFullYear() === currentYear) {
        earned += 1;
        firstMonthly = new Date(firstMonthly.getFullYear(), firstMonthly.getMonth() + 1, 1);
      }
    }

    return earned;
  } else {
    // Subsequent years: 1 CL per month from Jan 1 of current year
    let earned = 0;
    let firstOfMonth = new Date(currentYear, 0, 1); // Jan 1
    while (firstOfMonth <= today) {
      earned += 1;
      firstOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 1);
    }
    return earned;
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leave_type, start_date, end_date, reason } = await request.json();

    // 1. Calculate days requested
    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days <= 0) return NextResponse.json({ error: 'Invalid date range selected' }, { status: 400 });

    // 2. Fetch Employee Profile
    const { data: emp } = await supabase
      .from('employees')
      .select('id, role, joined_date, casual_leave_balance, medical_leave_balance, earned_leave_balance')
      .eq('email', user.email)
      .single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const isClOnly = CL_ONLY_ROLES.includes(emp.role?.toLowerCase());

    // 3. Enforce leave type restriction for CL-only roles
    if (isClOnly && leave_type !== 'Casual') {
      const roleLabel = emp.role === 'research_fellow' ? 'Research Fellow' : emp.role === 'research_intern' ? 'Research Intern' : 'Intern';
      return NextResponse.json({
        error: `Leave Policy: As a ${roleLabel}, you are entitled to Casual Leave only.`
      }, { status: 400 });
    }

    // 4. Calculate available balance
    let remainingBalance = 0;

    if (isClOnly) {
      if (!emp.joined_date) {
        return NextResponse.json({ error: 'Your joining date is not configured. Please contact your administrator.' }, { status: 400 });
      }

      // Earned CL based on DOJ policy (6 on DOJ, then 1/month after 6-month mark)
      const earnedCL = calculateEarnedCL(emp.joined_date);

      // Deduct already approved/pending CL applications in the CURRENT calendar year
      const currentYearStart = `${new Date().getFullYear()}-01-01`;
      const { data: usedLeaves } = await supabase
        .from('leave_applications')
        .select('total_days')
        .eq('employee_id', emp.id)
        .eq('leave_type', 'Casual')
        .in('status', ['approved', 'pending'])
        .gte('start_date', currentYearStart);

      const usedDays = (usedLeaves || []).reduce((acc, l) => acc + (l.total_days || 0), 0);
      remainingBalance = earnedCL - usedDays;

    } else {
      // Permanent staff: use stored balances by leave type
      if (leave_type === 'Casual') remainingBalance = emp.casual_leave_balance ?? 12;
      else if (leave_type === 'Sick' || leave_type === 'Medical') remainingBalance = emp.medical_leave_balance ?? 6;
      else if (leave_type === 'Earned') remainingBalance = emp.earned_leave_balance ?? 15;

      // Deduct already approved/pending for the same type
      const { data: activeLeaves } = await supabase
        .from('leave_applications')
        .select('total_days')
        .eq('employee_id', emp.id)
        .eq('leave_type', leave_type)
        .in('status', ['approved', 'pending']);
      const usedDays = (activeLeaves || []).reduce((acc, l) => acc + (l.total_days || 0), 0);
      remainingBalance = remainingBalance - usedDays;
    }

    // 5. Balance check
    if (days > remainingBalance) {
      return NextResponse.json({
        error: `Insufficient Balance: You have ${Math.max(0, remainingBalance)} day(s) available. This request is for ${days} day(s).`
      }, { status: 400 });
    }

    // 6. Check for overlapping leaves
    const { data: overlapping } = await supabase
      .from('leave_applications')
      .select('id')
      .eq('employee_id', emp.id)
      .in('status', ['approved', 'pending'])
      .or(`and(start_date.lte.${end_date},end_date.gte.${start_date})`);

    if (overlapping?.length > 0) {
      return NextResponse.json({ error: 'Scheduling Conflict: You already have a leave during this period.' }, { status: 400 });
    }

    // 7. Insert leave application
    const { data, error: dbError } = await supabase.from('leave_applications').insert({
      employee_id: emp.id,
      leave_type,
      start_date,
      end_date,
      total_days: days,
      reason,
      status: 'pending'
    }).select().single();

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Leave Apply Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
