import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  variant: z.string().min(1, 'Variant required'),
  formulation_id: z.string().uuid('Invalid formulation ID')
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const salt = crypto.randomUUID().split('-')[0].slice(-4).toUpperCase();
    const batchIdStr = `BTCH-${parsed.data.variant.split('-')[1].toUpperCase()}-${salt}`;

    const { data, error } = await supabase.from('batches').insert({ 
      batch_id: batchIdStr, 
      variant: parsed.data.variant, 
      formulation_id: parsed.data.formulation_id, 
      current_stage: 'media_prep', 
      status: 'pending', 
      start_time: new Date().toISOString() 
    }).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
