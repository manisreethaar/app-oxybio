import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addMonths, addYears, addWeeks } from 'date-fns';

const createSchema = z.object({
  title: z.string().min(1, 'Title required'),
  category: z.string().min(1, 'Category required'),
  due_date: z.string().min(1, 'Due date required'),
  responsible_person: z.string().optional(),
  document_link: z.string().optional(),
  notes: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence: z.enum(['weekly', 'monthly', 'annual']).optional(),
  status: z.string().default('upcoming')
});

const patchSchema = z.object({
  action: z.enum(['mark_done']),
  item_id: z.string().uuid()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { data, error } = await supabase.from('compliance_items').insert(parsed.data).select().single();
    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

    const { item_id } = parsed.data;

    // 1. Fetch current item
    const { data: item, error: fetchErr } = await supabase.from('compliance_items').select('*').eq('id', item_id).single();
    if (fetchErr) throw fetchErr;

    // 2. Mark current done
    const { error: markError } = await supabase.from('compliance_items').update({ status: 'done' }).eq('id', item_id);
    if (markError) throw markError;

    // 3. If recurring, create next iteration
    if (item.is_recurring && item.recurrence) {
      let nextDate = new Date(item.due_date);
      if (item.recurrence === 'weekly') nextDate = addWeeks(nextDate, 1);
      if (item.recurrence === 'monthly') nextDate = addMonths(nextDate, 1);
      if (item.recurrence === 'annual') nextDate = addYears(nextDate, 1);
      
      const { error: recurError } = await supabase.from('compliance_items').insert({
        title: item.title,
        category: item.category,
        due_date: nextDate.toISOString().split('T')[0],
        responsible_person: item.responsible_person || null,
        document_link: item.document_link || null,
        notes: item.notes || null,
        is_recurring: true,
        recurrence: item.recurrence,
        status: 'upcoming'
      });
      if (recurError) throw recurError;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
