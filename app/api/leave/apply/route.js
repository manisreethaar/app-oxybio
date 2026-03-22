import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { differenceInBusinessDays } from 'date-fns';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leave_type, start_date, end_date, reason } = await request.json();

    // 1. Calculate and Validate Days
    const days = differenceInBusinessDays(new Date(end_date), new Date(start_date)) + 1;
    if (days <= 0) return NextResponse.json({ error: 'Invalid date range selected' }, { status: 400 });

    // 2. Fetch User Role/ID
    const { data: emp } = await supabase.from('employees').select('id, role').eq('id', user.id).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // 3. Balance Check (Simulated for Now - ideally using a balances table)
    // For this implementation, we assume every employee starts with 20 base days
    // and we aggregate approved/pending days to calculate remainder.
    const { data: activeLeaves } = await supabase.from('leave_applications')
        .select('total_days')
        .eq('employee_id', emp.id)
        .in('status', ['approved', 'pending']);
    
    const spentDays = (activeLeaves || []).reduce((acc, curr) => acc + (curr.total_days || 0), 0);
    const LIMIT = 20; // Enterprise default
    
    if (spentDays + days > LIMIT) {
        return NextResponse.json({ 
            error: `Insufficient Balance: You have ${LIMIT - spentDays} days remaining. This request is for ${days} days.` 
        }, { status: 400 });
    }

    // New Fix: Validate Calendar Overlaps
    const { data: overlapping } = await supabase.from('leave_applications')
        .select('id')
        .eq('employee_id', emp.id)
        .in('status', ['approved', 'pending'])
        .or(`and(start_date.lte.${end_date},end_date.gte.${start_date})`);

    if (overlapping?.length > 0) {
        return NextResponse.json({ error: 'Scheduling Conflict: You already have approved/pending leave during this selected range.' }, { status: 400 });
    }

    // 4. Atomic Insert
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
    console.error('Leave API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
