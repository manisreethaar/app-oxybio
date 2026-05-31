import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

/**
 * Checks that the current Supabase session user has `action` permission
 * on the inventory module. Returns { user, employee } on success, or
 * { error: NextResponse } to return immediately on failure.
 */
export async function requireInventoryPermission(supabase, action) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, full_name')
    .eq('email', user.email)
    .single();

  if (!isMasterAdmin(user.email) && !can(employee?.role, 'inventory', action)) {
    return { error: NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 }) };
  }

  return { user, employee };
}
