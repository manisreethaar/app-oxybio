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
    // 1. Find all attendance logs that do not have a check_out_time
    const { data: openLogs, error: fetchError } = await supabaseAdmin
      .from('attendance_log')
      .select('id, check_in_time')
      .is('check_out_time', null);

    if (fetchError) throw fetchError;
    if (!openLogs || openLogs.length === 0) {
      return NextResponse.json({ success: true, message: 'No open shifts found. All loops closed.' });
    }

    // 2. Process Auto-Checkout
    const updates = openLogs.map(log => {
      // Calculate total hours from check_in to NOW (which is approx 11:59 PM)
      const checkInDate = new Date(log.check_in_time);
      const diffMs = now.getTime() - checkInDate.getTime();
      const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(1);

      return {
        id: log.id,
        check_out_time: now.toISOString(),
        total_hours: parseFloat(totalHours)
      };
    });

    // 3. Update Database using upsert logic
    const { error: updateError } = await supabaseAdmin
      .from('attendance_log')
      .upsert(updates);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      success: true, 
      message: `Successfully force-closed ${updates.length} abandoned shifts.` 
    });

  } catch (error) {
    console.error('Attendance Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
