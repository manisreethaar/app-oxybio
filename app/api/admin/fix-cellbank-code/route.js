import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'ceo', 'cto'];

/**
 * POST /api/admin/fix-cellbank-code
 * Body: { old_code: "OB-CB-25-002", new_code: "OB-CB-26-001" }
 *
 * One-time utility to rename a cell bank prep_code when it was created
 * with the wrong year or sequence number.
 */
export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Check role
    const { data: emp } = await adminSupabase
      .from('employees')
      .select('id, role, full_name')
      .eq('email', user.email)
      .single();

    if (!isMasterAdmin(user.email) && !ALLOWED_ROLES.includes(emp?.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden — admin only' }, { status: 403 });
    }

    const { old_code, new_code } = await request.json();

    if (!old_code || !new_code) {
      return NextResponse.json({ success: false, error: 'old_code and new_code are required' }, { status: 400 });
    }

    // Validate format OB-CB-YY-NNN
    const codePattern = /^OB-CB-\d{2}-\d{3}$/;
    if (!codePattern.test(old_code) || !codePattern.test(new_code)) {
      return NextResponse.json({ success: false, error: 'Codes must match format OB-CB-YY-NNN (e.g. OB-CB-26-001)' }, { status: 400 });
    }

    // Check old_code exists
    const { data: existing, error: findErr } = await adminSupabase
      .from('cell_bank_preparations')
      .select('id, prep_code, status')
      .eq('prep_code', old_code)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json({ success: false, error: `No preparation found with code "${old_code}"` }, { status: 404 });
    }

    // Check new_code is not already taken
    const { data: conflict } = await adminSupabase
      .from('cell_bank_preparations')
      .select('id')
      .eq('prep_code', new_code)
      .maybeSingle();

    if (conflict) {
      return NextResponse.json({ success: false, error: `Code "${new_code}" is already in use by another preparation` }, { status: 409 });
    }

    // Perform the rename
    const { data: updated, error: updateErr } = await adminSupabase
      .from('cell_bank_preparations')
      .update({ prep_code: new_code, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      message: `Renamed "${old_code}" → "${new_code}" successfully.`,
      data: { id: updated.id, old_code, new_code },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
