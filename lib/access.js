import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

/**
 * Universal RBAC helper for API routes.
 * Checks that the current Supabase session user has `action` permission
 * on the specified `module`. Returns { user, employee } on success, or
 * { error: NextResponse } to return immediately on failure.
 *
 * Usage:
 * const { error, user, employee } = await requireAccess(supabase, 'inventory', 'edit');
 * if (error) return error;
 */
export async function requireAccess(supabase, moduleName, action) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, full_name, is_active, custom_permissions')
    .eq('email', user.email)
    .single();

  if (!employee || !employee.is_active) {
      return { error: NextResponse.json({ success: false, error: 'Account inactive or not found' }, { status: 403 }) };
  }

  // Bypass RBAC if master admin
  if (!isMasterAdmin(user.email) && !can(employee.role, moduleName, action, employee.custom_permissions)) {
    return { error: NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 }) };
  }

  return { user, employee };
}

/**
 * Asserts the user is authenticated and active, without a specific module check.
 */
export async function requireAuth(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, full_name, is_active, custom_permissions')
    .eq('email', user.email)
    .single();

  if (!employee || !employee.is_active) {
      return { error: NextResponse.json({ success: false, error: 'Account inactive or not found' }, { status: 403 }) };
  }

  return { user, employee };
}
