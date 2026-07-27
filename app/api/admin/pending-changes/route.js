export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendServerNotification } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';

async function requireAdmin(supabase, user) {
  const { data: emp } = await supabase
    .from('employees')
    .select('id, role, full_name, department')
    .eq('email', user.email)
    .single();
  if (!emp || !['admin', 'ceo', 'cto', 'research_fellow'].includes(emp.role)) return null;
  return emp;
}

// GET /api/admin/pending-changes?status=pending
export async function GET(request) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await requireAdmin(supabase, user);
    if (!admin) return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    let query = supabaseAdmin
      .from('pending_changes')
      .select(`
        *,
        requester:requested_by!inner ( id, full_name, initials, role, department ),
        reviewer:reviewed_by   ( id, full_name, initials )
      `)
      .eq('status', status);

    if (!['ceo', 'cto'].includes(admin.role)) {
      if (admin.department) {
        query = query.eq('requester.department', admin.department);
      } else if (admin.role !== 'admin') {
        // If not global admin, and no department set, they see nothing
        query = query.eq('requested_by', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[Pending Changes GET] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/admin/pending-changes  { id, action: 'approve'|'reject', note? }
export async function PATCH(request) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await requireAdmin(supabase, user);
    if (!admin) return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });

    const { id, action, note } = await request.json();
    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request: id and action (approve|reject) required.' }, { status: 400 });
    }
    if (action === 'reject' && (!note || note.trim().length < 3)) {
      return NextResponse.json({ error: 'A reason is required when rejecting a request.' }, { status: 400 });
    }

    // Fetch the pending change
    const { data: change, error: fetchErr } = await supabaseAdmin
      .from('pending_changes')
      .select('*, requester:requested_by ( department )')
      .eq('id', id)
      .single();

    if (fetchErr || !change) return NextResponse.json({ error: 'Pending change not found.' }, { status: 404 });
    if (change.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 400 });
    }

    if (!['ceo', 'cto'].includes(admin.role)) {
      if (admin.role !== 'admin' || (admin.role === 'admin' && admin.department)) {
         if (change.requester?.department !== admin.department) {
           return NextResponse.json({ error: 'Forbidden: You can only approve requests from your department.' }, { status: 403 });
         }
      }
    }

    const now = new Date().toISOString();

    const SOFT_DELETE_TABLES = [
      'batches', 'activity_log', 'formulations', 'equipment',
      'tasks', 'lab_notebook_entries', 'inventory_items',
      'shelf_life_studies', 'deviations', 'capa_actions',
      'growth_studies', 'taste_panels', 'samples',
      'batch_fermentation_readings', 'growth_measurements',
      'shelf_life_logs', 'ph_readings', 'test_results',
    ];

    if (action === 'approve') {
      if (change.change_type === 'edit') {
        // Apply the proposed_data to the original table
        const { error: applyErr } = await supabaseAdmin
          .from(change.table_name)
          .update(change.proposed_data)
          .eq('id', change.record_id);

        if (applyErr) throw new Error(`Failed to apply edit to ${change.table_name}: ${applyErr.message}`);
      } else if (change.change_type === 'delete') {
        if (SOFT_DELETE_TABLES.includes(change.table_name)) {
          const { error: archiveErr } = await supabaseAdmin
            .from(change.table_name)
            .update({ archived_at: now, archived_by: admin.id })
            .eq('id', change.record_id);

          if (archiveErr) throw new Error(`Failed to archive ${change.table_name}: ${archiveErr.message}`);
        } else {
          const { error: deleteErr } = await supabaseAdmin
            .from(change.table_name)
            .delete()
            .eq('id', change.record_id);

          if (deleteErr) throw new Error(`Failed to delete from ${change.table_name}: ${deleteErr.message}`);
        }
      }
    }

    // Mark the pending change as reviewed
    await supabaseAdmin
      .from('pending_changes')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: admin.id,
        review_note: note || null,
        reviewed_at: now,
      })
      .eq('id', id);

    // Notify the requester
    const moduleLabel = change.module_label || change.table_name;
    await sendServerNotification(
      change.requested_by,
      action === 'approve'
        ? `✅ ${change.change_type === 'delete' ? 'Delete' : 'Edit'} Request Approved — ${moduleLabel}`
        : `❌ ${change.change_type === 'delete' ? 'Delete' : 'Edit'} Request Rejected — ${moduleLabel}`,
      action === 'approve'
        ? `Your ${change.change_type} request for a ${moduleLabel} record was approved and applied.`
        : `Your ${change.change_type} request was rejected. Reason: ${note}`,
      '/notifications'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Pending Changes PATCH] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
