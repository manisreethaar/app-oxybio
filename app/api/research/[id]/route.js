import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const patchSchema = z.object({
  avg_score:          z.preprocess((val) => Number(val), z.number().min(0).max(10)),
  scores:             z.array(z.record(z.string(), z.preprocess((val) => Number(val), z.number().min(0).max(10)))).min(1),
  attribute_comments: z.record(z.string(), z.array(z.string())).optional().nullable(),
});

export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const { id } = params;
    
    const { data: current } = await supabase.from('taste_panels').select('scores, scores_history').eq('id', id).single();
    const hasScores = current && Array.isArray(current.scores) && current.scores.length > 0;
    if (hasScores && emp.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can modify existing sensory scores' }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const existingHistory = Array.isArray(current?.scores_history) ? current.scores_history : [];
    const newHistory = current?.scores?.length
      ? [...existingHistory, { scored_at: new Date().toISOString(), scores: current.scores, avg_score: current.avg_score }]
      : existingHistory;

    const updatePayload = {
      avg_score:      parsed.data.avg_score,
      scores:         parsed.data.scores,
      scores_history: newHistory,
    };
    if (parsed.data.attribute_comments != null) {
      updatePayload.attribute_comments = parsed.data.attribute_comments;
    }

    const { data, error } = await supabase
      .from('taste_panels')
      .update(updatePayload)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, panel: data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!emp || emp.role !== 'admin') {
      return NextResponse.json({ error: 'Permission denied. Admins only.' }, { status: 403 });
    }

    const { error } = await supabase.from('taste_panels').delete().eq('id', params.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
