import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const COMPANY_PREFIX = 'O2B';

async function claimReleasedCode(supabaseAdmin, prefix) {
  const { data: released } = await supabaseAdmin
    .from('released_employee_codes')
    .select('employee_code')
    .ilike('employee_code', `${prefix}%`)
    .order('released_at', { ascending: true })
    .limit(1);
  
  if (released && released.length > 0) {
    const code = released[0].employee_code;
    await supabaseAdmin.from('released_employee_codes').delete().eq('employee_code', code);
    return code;
  }
  return null;
}

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

export async function POST(req) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
    const supabaseServer = createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Master Admin Override
    const isMaster = user.email === 'manisreethaar@gmail.com';

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

    const isAuthorized = isMaster || (requesterProfile && ['admin','ceo','cto'].includes(requesterProfile.role));

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 });
    }

    let { email, password, full_name, role, department, employee_code, designation, joined_date, designation_code } = await req.json();
    email = email.toLowerCase().trim();

    if (!email || !password || !full_name || !role || !department) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Handle employee code: check released codes first, or generate if not provided
    const ROLE_TO_CODE = {
      'ceo': 'CE', 'cto': 'CT', 'research_fellow': 'RF', 'scientist': 'SC',
      'research_intern': 'RI', 'intern': 'IN', 'admin': 'AD', 'staff': 'ST',
    };
    const codePrefix = designation_code || ROLE_TO_CODE[role] || 'ST';

    if (employee_code) {
      // If frontend provided a code, check if it's already released and claim it
      const { data: releasedCheck } = await supabaseAdmin
        .from('released_employee_codes')
        .select('employee_code')
        .eq('employee_code', employee_code);
      if (releasedCheck && releasedCheck.length > 0) {
        await supabaseAdmin.from('released_employee_codes').delete().eq('employee_code', employee_code);
      }
    } else {
      // No code provided - check released codes first
      const releasedCode = await claimReleasedCode(supabaseAdmin, `${COMPANY_PREFIX}-${codePrefix}-`);
      if (releasedCode) {
        employee_code = releasedCode;
      } else {
        // Generate new code based on active employees
        const { data: activeEmps } = await supabaseAdmin
          .from('employees')
          .select('employee_code')
          .eq('is_active', true);
        const existingCodes = (activeEmps || []).map(e => e.employee_code).filter(Boolean);
        employee_code = generateEmployeeCode(existingCodes, codePrefix);
      }
    }

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

    // Send Welcome Email (Fire and forget or parallel, don't block success)
    if (process.env.RESEND_API_KEY) {
      resend.emails.send({
        from: 'OxyOS Onboarding <onboarding@resend.dev>', // Should ideally be your verified domain
        to: email,
        subject: 'Welcome to OxyBio - Your OxyOS Credentials',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded-lg: 12px;">
            <h1 style="color: #1F3A5F; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Welcome to OxyBio, ${full_name}!</h1>
            <p style="color: #4b5563; font-size: 14px;">Your official employee account has been created on the OxyOS platform.</p>
            
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 24px 0;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em;">Your Credentials</p>
              <p style="margin: 8px 0; font-size: 16px; color: #1f2937;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 4px 0; font-size: 16px; color: #1f2937;"><strong>Temp Password:</strong> ${password}</p>
              <p style="margin: 4px 0; font-size: 16px; color: #1f2937;"><strong>Employee ID:</strong> ${employee_code || 'TBD'}</p>
            </div>

            <p style="color: #4b5563; font-size: 14px;">Please login at <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.oxygenbioinnovations.com'}/login" style="color: #1F3A5F; font-weight: 700; text-decoration: none;">OxyOS Login</a> and update your profile details.</p>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 32px; border-top: 1px solid #f3f4f6; pt: 16px;">This is an automated system email. For support, contact your HR administrator.</p>
          </div>
        `
      }).catch(e => console.error("Welcome email failed:", e));
    }

    return NextResponse.json({ success: true, user: authData.user });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
