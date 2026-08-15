import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function PATCH(request, { params }) {
  try {
    const supabaseAdmin = adminClient();
    const { id } = params;
    const body = await request.json();

    const updates = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.completion_time !== undefined) updates.completion_time = body.completion_time;
    if (body.notes !== undefined) updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('seed_passages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Auto-update incubation record if status changed to completed/failed
    if (updates.status && updates.status !== 'in_progress') {
      await supabaseAdmin.from('sample_incubation_records')
        .update({ end_time: new Date().toISOString() })
        .eq('seed_passage_id', id)
        .then(() => {}).catch(err => {
          console.warn('Seed passage incubation auto-update warning:', err.message);
        });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Seed Passages PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
