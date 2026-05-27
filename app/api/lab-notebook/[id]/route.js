import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { notifyAdmins } from '@/utils/serverNotify';
import {
  canCountersignLabNotebookEntry,
  canDeleteLabNotebookEntry,
  canEditLabNotebookEntry,
  validateLabNotebookStatusUpdate,
} from '@/lib/labNotebook/access';

async function getEmployeeForUser(supabase, user) {
  const { data } = await supabase
    .from('employees')
    .select('id, role')
    .eq('email', user.email)
    .single();
  return data || null;
}

export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .select(`
        id, title, objective, methodology, observations, conclusions, status, created_at, countersigned_at,
        stage_snapshots, batch_stage, attachment_url,
        batches (
          id, batch_id, variant
        ),
        cell_bank_preparations (
          id, prep_code, type, status
        ),
        author:employees!lab_notebook_entries_created_by_fkey (
          id, full_name, role
        ),
        countersigner:employees!lab_notebook_entries_countersigned_by_fkey (
          full_name, role
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Digital LNB API GET [id] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { title, objective, methodology, observations, conclusions, status, batch_id } = await request.json();

    const emp = await getEmployeeForUser(supabase, user);

    // Verify ownership and current status
    const { data: currentEntry, error: fetchErr } = await supabase
      .from('lab_notebook_entries')
      .select('created_by, status')
      .eq('id', id)
      .single();

    if (fetchErr || !currentEntry) {
      return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });
    }

    const editAccess = canEditLabNotebookEntry(currentEntry, emp, user.email);
    if (!editAccess.allowed) return NextResponse.json({ success: false, error: editAccess.error }, { status: 403 });

    const statusAccess = validateLabNotebookStatusUpdate(currentEntry.status, status);
    if (!statusAccess.allowed) return NextResponse.json({ success: false, error: statusAccess.error }, { status: 400 });

    const updates = { 
      title, objective, methodology, observations, conclusions, updated_at: new Date().toISOString() 
    };
    
    if (batch_id !== undefined) updates.batch_id = batch_id || null;
    if (status) updates.status = statusAccess.status; // Allows transitioning from Draft to Submitted

    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Notify supervisors when entry is submitted for countersigning
    if (updates.status === 'Submitted') {
      notifyAdmins(
        `LNB Review Required — ${data.title || 'Untitled Entry'}`,
        `A lab notebook entry has been submitted for countersigning. Please review and countersign.`,
        `/lab-notebook/${id}`,
        'info'
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Digital LNB API PUT [id] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { action } = await request.json();

    if (action !== 'countersign') {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    // Lookup employee by UUID to check if they can countersign
    const emp = await getEmployeeForUser(supabase, user);
    if (!emp) return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });

    const { data: currentEntry, error: fetchErr } = await supabase
      .from('lab_notebook_entries')
      .select('status, created_by')
      .eq('id', id)
      .single();

    if (fetchErr || !currentEntry) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });

    const countersignAccess = canCountersignLabNotebookEntry(currentEntry, emp, user.email);
    if (!countersignAccess.allowed) return NextResponse.json({ success: false, error: countersignAccess.error }, { status: 403 });

    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .update({
        status: 'Countersigned',
        countersigned_by: emp.id,
        countersigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Digital LNB API PATCH [id] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const emp = await getEmployeeForUser(supabase, user);
    if (!emp) return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });

    const { data: currentEntry, error: fetchErr } = await supabase
      .from('lab_notebook_entries')
      .select('status, created_by')
      .eq('id', id)
      .single();

    if (fetchErr || !currentEntry) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });

    const deleteAccess = canDeleteLabNotebookEntry(currentEntry, emp, user.email);
    if (!deleteAccess.allowed) return NextResponse.json({ success: false, error: deleteAccess.error }, { status: 403 });

    const { error } = await supabase
      .from('lab_notebook_entries')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Digital LNB API DELETE [id] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
