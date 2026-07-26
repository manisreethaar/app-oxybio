export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyDepartmentManagers } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiUser } from '@/utils/supabase/get-api-user';

const editRequestSchema = z.object({
  table_name:   z.string().min(1),
  record_id:    z.string().uuid(),
  change_type:  z.enum(['edit', 'delete']),
  proposed_data: z.record(z.unknown()).optional(),
  module_label: z.string().optional(),  // e.g. "Tasks", "Lab Notebook"
});

// Tables that support the edit-request flow and their ownership column
const ALLOWED_TABLES = {
  tasks:                       'created_by',
  formulations:                'created_by',
  lab_notebook_entries:        'created_by',
  inventory_items:             'created_by',
  samples:                     'collected_by',   // uses collected_by, not created_by
  ph_readings:                 'created_by',
  shelf_life_logs:             'created_by',
  shelf_life_studies:          'created_by',
  deviations:                  'created_by',
  capa_actions:                'created_by',
  growth_studies:              'created_by',
  batches:                     'created_by',
  batch_fermentation_readings: 'logged_by',
  growth_measurements:         'recorded_by',
  test_results:                'entered_by',
  activity_log:                'employee_id',
};

export async function POST(request) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = editRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { table_name, record_id, change_type, proposed_data, module_label } = parsed.data;

    if (!ALLOWED_TABLES[table_name]) {
      return NextResponse.json({ error: `Edit requests are not supported for table: ${table_name}` }, { status: 400 });
    }
    if (change_type === 'edit' && (!proposed_data || Object.keys(proposed_data).length === 0)) {
      return NextResponse.json({ error: 'proposed_data is required for edit requests.' }, { status: 400 });
    }

    // Get employee record
    const { data: emp } = await supabase.from('employees').select('id, full_name, role, initials').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee record not found.' }, { status: 404 });

    // Fetch the original record (use admin client to bypass RLS)
    const { data: original, error: fetchError } = await supabaseAdmin
      .from(table_name)
      .select('*')
      .eq('id', record_id)
      .single();

    if (fetchError || !original) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });

    // Ownership check: the requester must be the creator, or admin/ceo/cto
    const ownershipCol = ALLOWED_TABLES[table_name];
    const isAdmin = ['admin', 'ceo', 'cto'].includes(emp.role);
    const isOwner = original[ownershipCol] === emp.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({
        error: 'You can only request changes to records you created.',
      }, { status: 403 });
    }

    // Admins can edit directly — no need for approval flow
    if (isAdmin) {
      return NextResponse.json({
        error: 'Admins can edit records directly without a request.',
      }, { status: 400 });
    }

    // Block if there's already a pending request for this record
    const { data: existing } = await supabaseAdmin
      .from('pending_changes')
      .select('id')
      .eq('table_name', table_name)
      .eq('record_id', record_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        error: 'A pending change request already exists for this record. Wait for it to be reviewed.',
      }, { status: 409 });
    }

    // Capture only the fields being changed in original_data (for a cleaner diff)
    const relevantOriginal = proposed_data
      ? Object.fromEntries(Object.keys(proposed_data).map(k => [k, original[k]]))
      : original;

    // Insert the pending change
    const { error: insertError } = await supabaseAdmin
      .from('pending_changes')
      .insert({
        table_name,
        record_id,
        module_label: module_label || table_name,
        change_type,
        requested_by: emp.id,
        original_data: relevantOriginal,
        proposed_data: proposed_data || null,
        status: 'pending',
      });

    if (insertError) throw insertError;

    // Notify all admins
    const changeDesc = change_type === 'delete'
      ? `wants to DELETE a ${module_label || table_name} record`
      : `submitted an EDIT request for a ${module_label || table_name} record`;

    await notifyDepartmentManagers(
      emp.department,
      `✏️ Edit Request — ${module_label || table_name}`,
      `${emp.full_name || user.email} ${changeDesc}. Tap to review.`,
      '/admin/approvals'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Edit Request] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — let a user see their own pending requests
export async function GET(request) {
  try {
    const user = getApiUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    const { data, error } = await supabase
      .from('pending_changes')
      .select('id, table_name, module_label, record_id, change_type, status, created_at, review_note, original_data, proposed_data')
      .eq('requested_by', emp.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
