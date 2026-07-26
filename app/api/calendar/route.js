import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  title: z.string().min(1, 'Title required'),
  category: z.string().min(1, 'Category required'),
  deadline: z.string().min(1, 'Deadline required'),
  status: z.enum(['Pending', 'Completed', 'Overdue']).default('Pending'),
  priority: z.enum(['High', 'Medium', 'Low']).default('High')
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { error } = await supabase.from('regulatory_milestones').insert(parsed.data);

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
