import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  session_title: z.string().min(1, 'Session title required'),
  panelist_count: z.preprocess((val) => Number(val), z.number().min(1)),
  sample_ids: z.string().optional(),
  test_criteria: z.array(z.string()).min(1)
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { error } = await supabase.from('taste_panels').insert({
      ...parsed.data,
      avg_score: 0,
      scores: []
    });

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
