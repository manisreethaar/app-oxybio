import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

// Recipe code: R + digits (R01, R12) OR 2–5 uppercase letters optionally followed by digits (RKU, RKU01, KAVNI)
const CODE_RE = /^[A-Z]{1,5}\d{0,3}$/;
function validateCode(code) {
  if (!code || typeof code !== 'string') return 'Recipe code is required.';
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) return 'Recipe code must be 1–5 uppercase letters optionally followed by up to 3 digits (e.g. R01, RKU, RKU01).';
  return null;
}

export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('formulations')
      .select('*, approver:employees!formulations_approved_by_fkey(full_name)')
      .neq('status', 'Archived')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);

    const { data, error } = await query;

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
    const { code, name, ingredients, notes, base_version_id, category, base_volume_ml } = body;

    const codeErr = validateCode(code);
    if (codeErr) return NextResponse.json({ error: codeErr }, { status: 400 });
    const normCode = code.trim().toUpperCase();

    let nextVersion = 1;
    if (base_version_id) {
      const { data: base } = await supabase.from('formulations').select('version').eq('id', base_version_id).single();
      if (base) nextVersion = base.version + 1;
    } else {
      const { data: latest } = await supabase.from('formulations')
        .select('version')
        .eq('code', normCode)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) nextVersion = latest.version + 1;
    }

    // Get the employee record for created_by
    const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle();

    const adminDb = createAdminClient();
    const { data, error } = await adminDb.from('formulations').insert({
      code: normCode, name, ingredients, notes, base_volume_ml: base_volume_ml || 1000,
      version: nextVersion,
      created_by: emp?.id || null,
      base_version_id: base_version_id || null,
      status: 'Draft',
      category: category || 'Fermentation',
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

    const isApprover = emp && (can(emp.role, 'recipes', 'approve') || isMasterAdmin(user.email));

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

export async function PUT(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, name, ingredients, notes, category, base_volume_ml } = body;
    let { code } = body;

    const codeErr = validateCode(code);
    if (codeErr) return NextResponse.json({ error: codeErr }, { status: 400 });
    code = code.trim().toUpperCase();

    // Security: Only allow editing if Status is Draft or rejected
    const { data: current } = await supabase.from('formulations').select('status').eq('id', id).single();
    if (current && !['Draft', 'active', 'rejected', 'In Review'].includes(current.status)) {
       return NextResponse.json({ error: 'Cannot edit an approved formulation. Please create a new version instead.' }, { status: 403 });
    }

    const adminDb = createAdminClient();
    const { data, error } = await adminDb.from('formulations')
      .update({ code, name, ingredients, notes, base_volume_ml: base_volume_ml || 1000, ...(category ? { category } : {}) })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing recipe ID' }, { status: 400 });

    // Check requester role
    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).maybeSingle();
    const isApprover = emp && (can(emp.role, 'recipes', 'approve') || isMasterAdmin(user.email));

    // Fetch the recipe to check its status and owner
    const { data: current } = await supabase.from('formulations').select('status, created_by').eq('id', id).single();
    if (!current) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    // APPROVED recipes — only admins/CEO/CTO can delete; others must Archive
    if (current.status === 'Approved' && !isApprover) {
      return NextResponse.json(
        { error: 'Only admin/CEO/CTO can delete an approved recipe. Use Archive to hide it instead.' },
        { status: 403 }
      );
    }

    // IN REVIEW — only admins/CEO/CTO can delete
    if (current.status === 'In Review' && !isApprover) {
      return NextResponse.json({ error: 'Only an admin can delete a recipe that is In Review. Recall it to Draft first, or ask an admin to delete it.' }, { status: 403 });
    }

    // DRAFT — anyone can delete their own; admins can delete any
    const adminDb = createAdminClient();
    const { data: deleted, error } = await adminDb.from('formulations').delete().eq('id', id).select();
    if (error) throw error;
    if (!deleted || deleted.length === 0) {
       return NextResponse.json({ error: 'Recipe could not be deleted (it might be linked to existing batches).' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
