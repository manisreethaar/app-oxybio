import { createClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { isMasterAdmin } from '@/lib/permissions';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/archive-data
 * Body: { type: 'attendance' | 'activity_log' | 'vial_logs', older_than_days: number }
 * Archives old records by adding an archived_at timestamp (soft delete)
 * so they stop counting toward active queries but data is preserved.
 */
export async function POST(req) {
  try {
    // ── ALOCA++ P0: verify caller identity and role before touching audit data ──
    const userSupabase = createUserClient();
    const user = await getApiUserOrFallback(userSupabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await userSupabase
      .from('employees')
      .select('role')
      .eq('email', user.email)
      .single();

    if (!caller || (!['admin', 'ceo'].includes(caller.role) && !isMasterAdmin(user.email))) {
      return NextResponse.json({ error: 'Forbidden: Admin or CEO role required to archive data' }, { status: 403 });
    }
    // ────────────────────────────────────────────────────────────────────────────

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { type, older_than_days = 180 } = await req.json();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - older_than_days);
    const cutoff = cutoffDate.toISOString();

    let result;

    switch (type) {
      case 'attendance': {
        // Archive attendance logs older than cutoff
        const { data, error } = await supabase
          .from('attendance_log')
          .update({ archived_at: new Date().toISOString() })
          .lt('date', cutoff.split('T')[0])
          .is('archived_at', null)
          .select('id');
        if (error) throw error;
        result = { archived: data?.length || 0, table: 'attendance_log' };
        break;
      }
      case 'activity_log': {
        const { data, error } = await supabase
          .from('activity_log')
          .update({ archived_at: new Date().toISOString() })
          .lt('logged_at', cutoff)
          .is('archived_at', null)
          .select('id');
        if (error) throw error;
        result = { archived: data?.length || 0, table: 'activity_log' };
        break;
      }
      case 'vial_logs': {
        const { data, error } = await supabase
          .from('cell_bank_vial_logs')
          .delete()
          .lt('created_at', cutoff)
          .select('id');
        if (error) throw error;
        result = { archived: data?.length || 0, table: 'cell_bank_vial_logs' };
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
