import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

/**
 * Basic research access guard — requires a valid logged-in employee (or master admin).
 * Returns { user, emp } on success, or { error: NextResponse } on failure.
 *
 * Used by: cell-bank/route.js, cell-bank/[id]/route.js,
 *          cell-bank/vials/route.js, cell-bank/vials/[vialId]/route.js
 */
export async function requireResearchAccess(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: emp } = await supabase
    .from('employees')
    .select('id, role, full_name')
    .eq('email', user.email)
    .single();
  if (!emp && !isMasterAdmin(user.email)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, emp };
}

/**
 * Lab access guard with optional action-based permission check.
 * Checks: login → employee exists → isMasterAdmin override → can(role, 'batches', action).
 * Returns { user, employee } on success, or { error: NextResponse } on failure.
 *
 * Used by: research/incubation/route.js
 */
export async function requireLabAccess(supabase, action = 'view') {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, full_name')
    .eq('email', user.email)
    .single();

  if (!employee && !isMasterAdmin(user.email)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden: Employee not found' }, { status: 403 }) };
  }

  if (!isMasterAdmin(user.email) && !can(employee?.role, 'batches', action)) {
    return { error: NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 }) };
  }

  return { user, employee };
}
