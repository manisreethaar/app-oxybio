import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

const COMPANY_PREFIX = 'O2B';

function generateEmployeeCode(existingCodes, designationCode) {
  if (!designationCode || designationCode.trim().length < 1) return '';
  const prefix = `${COMPANY_PREFIX}-${designationCode.toUpperCase()}-`;
  const existing = existingCodes
    .filter(c => c && c.startsWith(prefix))
    .map(c => parseInt(c.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

// Role → Designation Code map for auto-generation
const ROLE_TO_CODE = {
  'ceo':             'CE',
  'cto':             'CT',
  'research_fellow': 'RF',
  'scientist':       'SC',
  'research_intern': 'RI',
  'intern':          'IN',
  'admin':           'AD',
  'staff':           'ST',
};

export async function POST(req) {
  try {
    const supabaseServer = createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Only admin/ceo/cto can change roles
    const isMaster = user.email === 'manisreethaar@gmail.com';
    const { data: requester } = await supabaseAdmin.from('employees').select('role').eq('id', user.id).single();
    const isAuthorized = isMaster || (['admin', 'ceo', 'cto'].includes(requester?.role));
    if (!isAuthorized) return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 });

    const { employee_id, new_role, new_designation, designation_code } = await req.json();
    if (!employee_id || !new_role) return NextResponse.json({ error: 'employee_id and new_role are required' }, { status: 400 });

    // Prevent changing your own role
    if (employee_id === user.id && !isMaster) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 });
    }

    // Fetch only ACTIVE employees — inactive/deactivated accounts don't consume sequence slots
    const { data: allEmps } = await supabaseAdmin
      .from('employees')
      .select('employee_code, is_active')
      .eq('is_active', true);
    const existingCodes = (allEmps || []).map(e => e.employee_code).filter(Boolean);

    // Determine the designation code to use
    const code = designation_code || ROLE_TO_CODE[new_role] || 'ST';
    const new_employee_code = generateEmployeeCode(existingCodes, code);

    // Atomically update role, designation, and employee_code
    const { error: updateError } = await supabaseAdmin
      .from('employees')
      .update({
        role: new_role,
        designation: new_designation || new_role,
        employee_code: new_employee_code,
      })
      .eq('id', employee_id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, new_employee_code });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
