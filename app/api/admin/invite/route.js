import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

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

    // Check if requester is admin using Admin client to bypass RLS quirks matching
    let { data: requesterProfile } = await supabaseAdmin
      .from('employees')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!requesterProfile) {
      // Fallback: check by email in case UUID was mismatched during manual insert
      const { data: profileByEmail } = await supabaseAdmin.from('employees').select('role').eq('email', user.email).single();
      requesterProfile = profileByEmail;
    }

    if (!requesterProfile || requesterProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 });
    }

    const { email, password, full_name, role, department, employee_code, designation, joined_date } = await req.json();

    if (!email || !password || !full_name || !role || !department) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Variables serviceKey and supabaseAdmin are already declared above

    // Create user in Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // auto confirm bypasses email loop
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Insert into employees table
    const { error: dbError } = await supabaseAdmin
      .from('employees')
      .insert({
        id: authData.user.id,
        email: email,
        full_name: full_name,
        role: role,
        department: department,
        employee_code: employee_code || null,
        designation: designation || null,
        joined_date: joined_date || new Date().toISOString().split('T')[0],
        is_active: true
      });

    if (dbError) {
        // Rollback user creation (best effort) if db insert fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: authData.user });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
