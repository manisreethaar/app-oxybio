import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { differenceInCalendarMonths } from 'date-fns';

// Roles that only get Casual Leave, earned at 1 day per month from DOJ
const CL_ONLY_ROLES = ['intern', 'research_intern'];

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

    // 2. Fetch Employee Profile (role + joined_date + leave balances)
    const { data: emp } = await supabase
      .from('employees')
      .select('id, role, joined_date, casual_leave_balance, medical_leave_balance, earned_leave_balance')
      .eq('email', user.email)
      .single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const isClOnly = CL_ONLY_ROLES.includes(emp.role?.toLowerCase());

    // 3. Enforce leave type for interns/research interns
    if (isClOnly && leave_type !== 'Casual') {
      return NextResponse.json({
        error: `Leave Policy: As ${emp.role === 'intern' ? 'an Intern' : 'a Research Intern'}, you are only entitled to Casual Leave.`
      }, { status: 400 });
    }

    // 4. Calculate leave balance
    let remainingBalance = 0;

    if (isClOnly) {
      // DOJ-based: 1 CL per completed month since joining
      if (!emp.joined_date) {
        return NextResponse.json({ error: 'Your joining date is not set. Please contact your administrator.' }, { status: 400 });
      }
      const monthsWorked = differenceInCalendarMonths(new Date(), new Date(emp.joined_date));
      const earnedCL = Math.max(0, monthsWorked); // 0 if joined this month

      // Fetch already approved/pending CL
      const { data: usedLeaves } = await supabase
        .from('leave_applications')
        .select('total_days')
        .eq('employee_id', emp.id)
        .eq('leave_type', 'Casual')
        .in('status', ['approved', 'pending']);

      const usedDays = (usedLeaves || []).reduce((acc, l) => acc + (l.total_days || 0), 0);
      remainingBalance = earnedCL - usedDays;

    } else {
      // Permanent staff: use stored balances by leave type
      if (leave_type === 'Casual') remainingBalance = emp.casual_leave_balance || 12;
      else if (leave_type === 'Sick' || leave_type === 'Medical') remainingBalance = emp.medical_leave_balance || 6;
      else if (leave_type === 'Earned') remainingBalance = emp.earned_leave_balance || 15;
      else remainingBalance = 0;

      // Deduct already approved/pending for this type
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
        error: `Insufficient Balance: You have ${Math.max(0, remainingBalance)} day(s) remaining. This request is for ${days} day(s).`
      }, { status: 400 });
    }

    // 6. Check Calendar Overlaps
    const { data: overlapping } = await supabase
      .from('leave_applications')
      .select('id')
      .eq('employee_id', emp.id)
      .in('status', ['approved', 'pending'])
      .or(`and(start_date.lte.${end_date},end_date.gte.${start_date})`);

    if (overlapping?.length > 0) {
      return NextResponse.json({ error: 'Scheduling Conflict: You already have approved/pending leave during this selected range.' }, { status: 400 });
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
