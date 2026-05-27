import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postLogSchema = z.object({
  day_number: z.number().min(0),
  test_data: z.record(z.string(), z.any()) // JSON object storing pH, CFU, etc.
});

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const parsed = postLogSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { day_number, test_data } = parsed.data;
    const study_id = params.id;

    // Upsert logic based on study_id and day_number
    // We can just query if one exists, then update, else insert.
    const { data: existing } = await supabase
      .from('shelf_life_logs')
      .select('id')
      .eq('study_id', study_id)
      .eq('day_number', day_number)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('shelf_life_logs')
        .update({ test_data, logged_by: emp.id })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } else {
      const { data, error } = await supabase
        .from('shelf_life_logs')
        .insert({
          study_id,
          day_number,
          test_data,
          logged_by: emp.id
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
