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

    const { id, status, rejection_reason } = await request.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing ID or Status' }, { status: 400 });

    // Look up employee for role checks
    let emp = null;
    const { data: empByEmail } = await supabase.from('employees').select('id, role').eq('email', user.email).maybeSingle();
    emp = empByEmail;

    const isApprover = emp && APPROVER_ROLES.includes(emp.role?.toLowerCase());

    // 1. APPROVAL logic
    if (status === 'Approved') {
      if (!isApprover) {
        return NextResponse.json({ error: 'Only CEO, CTO, or Admin can approve formulations.' }, { status: 403 });
      }
      // Log who approved and when, and clear any old rejection reason
      const { data, error } = await supabase
        .from('formulations')
        .update({ 
            status: 'Approved', 
            approved_by: emp.id, 
            approved_at: new Date().toISOString(),
            rejection_reason: null 
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    // 2. REJECTION logic (Moving back to Draft with a reason)
    if (status === 'Draft' && isApprover) {
        if (!rejection_reason || rejection_reason.trim().length < 5) {
            // Only enforce mandatory reason if it's currently "In Review" (i.e., a real rejection)
            const { data: current } = await supabase.from('formulations').select('status').eq('id', id).single();
            if (current?.status === 'In Review') {
                return NextResponse.json({ error: 'A mandatory rejection reason (min 5 characters) is required to return a recipe to Draft.' }, { status: 400 });
            }
        }
    }

    // For other status transitions (Draft → In Review, Approved → Archived)
    const validTransitions = ['Draft', 'In Review', 'Archived'];
    if (!validTransitions.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('formulations')
      .update({ 
          status,
          rejection_reason: (status === 'Draft' && isApprover) ? rejection_reason : undefined
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
