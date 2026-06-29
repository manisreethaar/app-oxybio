export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const editSchema = z.object({
  pf_deduction:    z.preprocess(v => Number(v) || 0, z.number().min(0)),
  esi_deduction:   z.preprocess(v => Number(v) || 0, z.number().min(0)),
  override_lop_days: z.preprocess(v => Number(v) || 0, z.number().min(0)).optional(),
  lop_deduction:   z.preprocess(v => Number(v) || 0, z.number().min(0)).optional(),
  gross_salary:    z.preprocess(v => Number(v) || 0, z.number().min(0)),
  net_salary:      z.preprocess(v => Number(v) || 0, z.number().min(0)),
  admin_notes:     z.string().optional().nullable(),
});

export async function PUT(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: adminEmp } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();

    if (!adminEmp || !['admin', 'ceo', 'cto'].includes(adminEmp.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    if (!id) return NextResponse.json({ error: 'Payslip ID required' }, { status: 400 });

    const body = await request.json();
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('payslips')
      .update({
        ...parsed.data,
        uploaded_by: adminEmp.id,
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
