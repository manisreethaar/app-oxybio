import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .select(`
        id,
        title,
        status,
        batch_stage,
        created_at,
        created_by,
        batches (
          id,
          batch_id,
          variant,
          status
        ),
        cell_bank_preparations (
          id,
          prep_code,
          type,
          status
        ),
        flask:batch_flasks!lab_notebook_entries_flask_id_fkey (
          flask_label
        ),
        author:employees!lab_notebook_entries_created_by_fkey (
          id,
          full_name,
          initials,
          role
        ),
        countersigner:employees!lab_notebook_entries_countersigned_by_fkey (
          full_name,
          role
        )
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Digital LNB API GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { title, batch_id, flask_id, batch_stage, attachment_url, cell_bank_preparation_id,
            sop_references, previous_version_id, entry_version } = await request.json();

    if (!title) {
      return NextResponse.json({ success: false, error: 'Experiment title is required' }, { status: 400 });
    }

    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .insert({
        title,
        batch_id:    batch_id    || null,
        flask_id:    flask_id    || null,
        cell_bank_preparation_id: cell_bank_preparation_id || null,
        batch_stage:         batch_stage || null,
        attachment_url:      attachment_url || null,
        sop_references:      sop_references || [],
        previous_version_id: previous_version_id || null,
        entry_version:       entry_version || 1,
        created_by: emp.id,
        status: 'Draft'
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Digital LNB API POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
