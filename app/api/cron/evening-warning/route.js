import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Serverless Function Config
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get current date in IST
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + (5.5 * 60 * 60 * 1000));
    const todayStr = nowIst.toISOString().split('T')[0];

    // 1. Fetch entries that have check_in_time for today but no check_out_time
    const { data: openShifts, error: fetchError } = await supabaseAdmin
      .from('attendance_log')
      .select('employee_id, check_in_time')
      .eq('date', todayStr)
      .is('check_out_time', null);

    if (fetchError) throw fetchError;
    if (!openShifts || openShifts.length === 0) {
      return NextResponse.json({ success: true, message: 'All active shifts are already closed for today.' });
    }

    // 2. Fetch employee details for these IDs
    const employeeIds = openShifts.map(s => s.employee_id);
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, full_name')
      .in('id', employeeIds);
    
    if (empError) throw empError;

    // 3. Create notifications & Push warnings
    const notifications = employees.map(emp => ({
      employee_id: emp.id,
      title: '🔴 Forget to Check Out?',
      message: 'It is past 9:00 PM and your shift is still open. Please check out now to avoid a 0-hour mispunch penalty.',
      url: '/attendance',
      is_read: false
    }));

    await supabaseAdmin.from('notifications').insert(notifications);

    // Fire off Push Notifications
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.oxygenbioinnovations.com';
    await Promise.allSettled(employees.map(emp => 
      fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}` 
        },
        body: JSON.stringify({
          assigned_to: emp.id,
          title: '🔴 Still Checked In?',
          body: 'Please check out from OxyOS before midnight or your hours for today will be zeroed out.',
          url: '/attendance'
        })
      })
    ));

    return NextResponse.json({ 
      success: true, 
      message: `Sent 9:00 PM warnings to ${employees.length} employees.` 
    });

  } catch (error) {
    console.error('Evening Warning Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
