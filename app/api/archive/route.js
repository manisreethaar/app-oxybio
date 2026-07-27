export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUser } from '@/utils/supabase/get-api-user';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

async function requireAdmin(supabase, user) {
  const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
  if (!emp || !['admin', 'ceo', 'cto'].includes(emp.role)) return null;
  return emp;
}

// GET /api/archive?tab=formulations|equipment|tasks|lnb|inventory|employees
export async function GET(request) {
  try {
    const supabase = createClient();
    const db = createAdminClient();
    const user = getApiUser();
    const authErr = null;
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = await requireAdmin(supabase, user);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab');

    const queries = {
      batches: () => db.from('batches')
        .select('id, batch_id, experiment_type, sku_target, status, current_stage, archived_at, created_at, formulations(name, code, version)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      activity: () => db.from('activity_log')
        .select('id, created_at, archived_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, severity, employees(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      formulations: () => db.from('formulations')
        .select('id, name, code, version, status, category, archived_at, created_at')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      equipment: () => db.from('equipment')
        .select('id, name, model, serial_number, status, archived_at, created_at')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      tasks: () => db.from('tasks')
        .select('id, title, priority, status, archived_at, created_at, assigned_user:employees!tasks_assigned_to_fkey(full_name), creator:employees!tasks_assigned_by_fkey(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      lnb: () => db.from('lab_notebook_entries')
        .select('id, title, status, batch_stage, archived_at, created_at, batches(batch_id), author:employees!lab_notebook_entries_created_by_fkey(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      inventory: () => db.from('inventory_items')
        .select('id, name, category, unit, archived_at, created_at')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      employees: () => db.from('employees')
        .select('id, full_name, role, designation, employee_code, email, department, joined_date, created_at')
        .eq('is_active', false).order('created_at', { ascending: false }),

      shelf_life: () => db.from('shelf_life_studies')
        .select('id, storage_condition, study_type, status, start_date, archived_at, created_at, batches(batch_id), creator:employees!shelf_life_studies_created_by_fkey(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      deviations: () => db.from('deviations')
        .select('id, title, severity, source, status, archived_at, created_at, batches(batch_id), reporter:employees!deviations_reported_by_fkey(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      capa: () => db.from('capa_actions')
        .select('id, action_type, title, status, archived_at, created_at, assignee:employees!capa_actions_assigned_to_fkey(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      growth_studies: () => db.from('growth_studies')
        .select('id, title, status, archived_at, created_at, creator:employees!growth_studies_created_by_fkey(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      research: () => db.from('taste_panels')
        .select('id, session_title, panelist_count, status, archived_at, created_at, batches(batch_id), creator:employees!created_by(full_name)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),

      samples: () => db.from('samples')
        .select('id, sample_label, source_type, source_label, archived_at, created_at, batches(batch_id)')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }),
    };

    if (tab && queries[tab]) {
      const { data, error } = await queries[tab]();
      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }

    // Return counts for all tabs
    const results = await Promise.all(
      Object.entries(queries).map(async ([key, fn]) => {
        const { data } = await fn();
        return [key, (data || []).length];
      })
    );
    return NextResponse.json({ counts: Object.fromEntries(results) });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/archive  { table, id, action: 'restore' }
export async function PATCH(request) {
  try {
    const supabase = createClient();
    const db = createAdminClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = await requireAdmin(supabase, user);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { table, id, action } = await request.json();
    if (!table || !id || action !== 'restore') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const RESTORABLE = [
      'batches', 'activity_log', 'formulations', 'equipment', 'tasks', 'lab_notebook_entries', 'inventory_items',
      'shelf_life_studies', 'deviations', 'capa_actions', 'growth_studies', 'taste_panels', 'samples',
    ];
    if (!RESTORABLE.includes(table)) return NextResponse.json({ error: 'Table not restorable' }, { status: 400 });

    const { error } = await db.from(table)
      .update({ archived_at: null, archived_by: null })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/archive  { table, id }  — permanent delete from archive
export async function DELETE(request) {
  try {
    const supabase = createClient();
    const db = createAdminClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = await requireAdmin(supabase, user);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const id    = searchParams.get('id');

    const DELETABLE = [
      'batches', 'activity_log', 'formulations', 'equipment', 'tasks', 'lab_notebook_entries', 'inventory_items',
      'shelf_life_studies', 'deviations', 'capa_actions', 'growth_studies', 'taste_panels', 'samples',
    ];
    if (!table || !id || !DELETABLE.includes(table)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const { error } = await db.from(table).delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
