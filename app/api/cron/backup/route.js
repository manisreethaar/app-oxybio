import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  // Validate cron secret header to prevent unauthorized calls
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow internal Vercel cron (no auth header needed on Vercel)
    // but block external callers without the secret
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createClient();
    const todayStr = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];

    // Snapshot key table counts for health monitoring
    const [
      { count: batchCount },
      { count: attendanceCount },
      { count: deviationCount },
      { count: docCount },
      { count: employeeCount }
    ] = await Promise.all([
      supabase.from('batches').select('*', { count: 'exact', head: true }),
      supabase.from('attendance_log').select('*', { count: 'exact', head: true }).eq('date', todayStr),
      supabase.from('deviations').select('*', { count: 'exact', head: true }).neq('status', 'Closed'),
      supabase.from('documents').select('*', { count: 'exact', head: true }),
      supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true)
    ]);

    const snapshot = {
      date: todayStr,
      active_employees: employeeCount,
      attendance_today: attendanceCount,
      active_batches: batchCount,
      open_deviations: deviationCount,
      total_documents: docCount,
      status: 'healthy',
      timestamp: new Date().toISOString()
    };

    // Log to console (Vercel stores these in Function logs for 30 days)
    console.log('[OxyOS Daily Health Snapshot]', JSON.stringify(snapshot));

    // Optionally insert into a system_health_log table if it exists
    await supabase.from('system_health_log').insert(snapshot).then(() => {}).catch(() => {
      // Table may not exist yet — silently skip, log-based backup is primary
      console.log('[Backup Cron] system_health_log table not found, skipping DB write. Console log preserved.');
    });

    return NextResponse.json({ success: true, snapshot });

  } catch (error) {
    console.error('[OxyOS Backup Cron Error]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
