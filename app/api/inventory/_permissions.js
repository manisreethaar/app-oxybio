import { NextResponse } from 'next/server';
import { can } from '@/lib/permissions';

const MASTER_EMAIL = 'manisreethaar@gmail.com';

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

  if (user.email !== MASTER_EMAIL && !can(employee?.role, 'inventory', action)) {
    return { error: NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 }) };
  }

  return { user, employee };
}
