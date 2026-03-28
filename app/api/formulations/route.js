import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

const APPROVER_ROLES = ['admin', 'ceo', 'cto'];

export async function GET() {
  try {
    const supabase = createClient();
    // Return ALL non-archived formulations so the page can show status-based workflow
    const { data, error } = await supabase
      .from('formulations')
      .select('*, approver:employees!formulations_approved_by_fkey(full_name)')
      .neq('status', 'Archived')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { code, name, ingredients, notes, base_version_id } = body;

    let nextVersion = 1;
    if (base_version_id) {
      const { data: base } = await supabase.from('formulations').select('version').eq('id', base_version_id).single();
      if (base) nextVersion = base.version + 1;
    } else {
      const { data: latest } = await supabase.from('formulations')
        .select('version')
        .eq('code', code)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      if (latest) nextVersion = latest.version + 1;
    }

    // Get the employee record for created_by
    const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).single();

    const { data, error } = await supabase.from('formulations').insert({
      code, name, ingredients, notes,
      version: nextVersion,
      created_by: emp?.id || null,
      base_version_id: base_version_id || null,
      status: 'Draft'  // All new recipes start as Draft
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, status } = await request.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing ID or Status' }, { status: 400 });

    // Approval requires elevated role
    if (status === 'Approved') {
      // Look up employee — try user_id column first, fall back to email match
      let emp = null;
      const { data: empById } = await supabase.from('employees').select('id, role').eq('id', user.id).maybeSingle();
      if (empById) {
        emp = empById;
      } else {
        const { data: empByEmail } = await supabase.from('employees').select('id, role').eq('email', user.email).maybeSingle();
        emp = empByEmail;
      }
      if (!emp || !APPROVER_ROLES.includes(emp.role?.toLowerCase())) {
        return NextResponse.json({ error: 'Only CEO, CTO, or Admin can approve formulations.' }, { status: 403 });
      }
      // Log who approved and when
      const { data, error } = await supabase
        .from('formulations')
        .update({ status: 'Approved', approved_by: emp.id, approved_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    // For other status transitions (Draft → In Review, Approved → Archived)
    const validTransitions = ['Draft', 'In Review', 'Archived'];
    if (!validTransitions.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('formulations')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
