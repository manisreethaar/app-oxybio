import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch full experiment notebooks
    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .select(`
        id,
        title,
        status,
        created_at,
        batches (
          batch_id,
          variant
        ),
        author:employees!lab_notebook_entries_created_by_fkey (
          full_name,
          role
        ),
        countersigner:employees!lab_notebook_entries_countersigned_by_fkey (
          full_name,
          role
        )
      `)
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

    const { title, batch_id } = await request.json();

    if (!title) {
      return NextResponse.json({ success: false, error: 'Experiment title is required' }, { status: 400 });
    }

    // Lookup employee by UUID
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found' }, { status: 404 });
    }

    // Create a new drafted notebook entry
    const { data, error } = await supabase
      .from('lab_notebook_entries')
      .insert({
        title,
        batch_id: batch_id || null,
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
