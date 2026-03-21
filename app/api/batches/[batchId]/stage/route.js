import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { batchId } = params;
    const { from_stage, to_stage, notes } = await request.json();

    if (!to_stage) {
      return NextResponse.json({ success: false, error: 'Target stage is required.' }, { status: 400 });
    }

    // Lookup employee by UUID
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }

    // SANITIZE: Prevent XSS in audit trail notes
    const cleanNotes = notes ? notes.substring(0, 500).replace(/[<>]/g, '') : '';

    // 1. Update batch stage
    const { error: updateError } = await supabase
      .from('batches')
      .update({ current_stage: to_stage })
      .eq('id', batchId);

    if (updateError) throw updateError;

    // 2. Record transition in audit trail
    const { error: transError } = await supabase
      .from('stage_transitions')
      .insert({
        batch_id: batchId,
        from_stage,
        to_stage,
        changed_by: emp.id,
        notes: cleanNotes
      });

    if (transError) throw transError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Stage Transition API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
