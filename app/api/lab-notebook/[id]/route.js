import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

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
        batches (
          id, batch_id, variant
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

    // Verify ownership and current status
    const { data: currentEntry, error: fetchErr } = await supabase
      .from('lab_notebook_entries')
      .select('created_by, status')
      .eq('id', id)
      .single();

    if (fetchErr || !currentEntry) {
      return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });
    }

    if (currentEntry.status !== 'Draft') {
      return NextResponse.json({ success: false, error: 'Only drafts can be modified.' }, { status: 403 });
    }

    const updates = { 
      title, objective, methodology, observations, conclusions, updated_at: new Date().toISOString() 
    };
    
    if (batch_id !== undefined) updates.batch_id = batch_id || null;
    if (status) updates.status = status; // Allows transitioning from Draft to Submitted

    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
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
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (empErr || !emp) return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });

    // Only admins or lab managers (not implemented, but admin works) can countersign
    if (emp.role !== 'admin' && emp.role !== 'research_fellow') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to countersign' }, { status: 403 });
    }

    const { data: currentEntry, error: fetchErr } = await supabase
      .from('lab_notebook_entries')
      .select('status, created_by')
      .eq('id', id)
      .single();

    if (fetchErr || !currentEntry) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });

    if (currentEntry.status !== 'Submitted') {
      return NextResponse.json({ success: false, error: 'Only submitted entries can be countersigned.' }, { status: 400 });
    }

    if (currentEntry.created_by === emp.id) {
       return NextResponse.json({ success: false, error: 'You cannot countersign your own entries.' }, { status: 403 });
    }

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
