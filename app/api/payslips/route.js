import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  employee_id: z.string().uuid('Invalid employee ID'),
  month: z.string().min(1, 'Month required'),
  year: z.preprocess((val) => Number(val), z.number()),
  gross_salary: z.preprocess((val) => Number(val), z.number().min(0)),
  pf_deduction: z.preprocess((val) => Number(val) || 0, z.number().min(0)),
  esi_deduction: z.preprocess((val) => Number(val) || 0, z.number().min(0)),
  net_salary: z.preprocess((val) => Number(val), z.number().min(0)),
  payslip_url: z.string().optional()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp, error: empError } = await supabase.from('employees').select('id, role').eq('id', user.id).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (emp.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { error } = await supabase.from('payslips').insert({
      ...parsed.data,
      uploaded_by: emp.id,
      uploaded_at: new Date().toISOString()
    });

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
