import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const patchSchema = z.object({
  avg_score: z.preprocess((val) => Number(val), z.number().min(0).max(10)),
  scores: z.array(z.record(z.string(), z.preprocess((val) => Number(val), z.number().min(0).max(10)))).min(1),
});

export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('taste_panels')
      .update({
        avg_score: parsed.data.avg_score,
        scores: parsed.data.scores,
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, panel: data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
