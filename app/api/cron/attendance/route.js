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

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // Also include yesterday to cover overnight grace period (shifts started late and still running)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // 1. Find attendance logs that do not have a check_out_time, only for today (or yesterday)
    const { data: openLogs, error: fetchError } = await supabaseAdmin
      .from('attendance_log')
      .select('id, check_in_time')
      .is('check_out_time', null)
      .in('date', [todayStr, yesterdayStr]);

    if (fetchError) throw fetchError;

    // 2. Filter for abandoned shifts (started more than 12 hours ago)
    // Per latest request: Only shifts older than 12 hours should be zeroed out.
    const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
    const shiftsToClose = openLogs?.filter(log => new Date(log.check_in_time) < twelveHoursAgo) || [];

    if (shiftsToClose.length === 0) {
      return NextResponse.json({ success: true, message: 'No abandoned shifts (older than 12h) found.' });
    }

    // 3. Process Auto-Checkout for abandoned shifts
    const updates = shiftsToClose.map(log => {
      return {
        id: log.id,
        check_out_time: now.toISOString(),
        total_hours: 0, // 0 Hours until executive approval
        mispunch_status: 'required',
        notes: '[SYSTEM: AUTO-CLOSED - MISPUNCH REVIEW REQUIRED]'
      };
    });

    // 3. Update Database using upsert logic
    const { error: updateError } = await supabaseAdmin
      .from('attendance_log')
      .upsert(updates);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      success: true, 
      message: `Successfully zeroed out ${updates.length} abandoned shifts for Mispunch Review.` 
    });

  } catch (error) {
    console.error('Attendance Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
