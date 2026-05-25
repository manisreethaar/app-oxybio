import { createClient } from '@/utils/supabase/server';
import { sendServerNotification } from '@/utils/serverNotify';
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
  payslip_url: z.string().optional().nullable(),
  // Auto-generated payroll fields
  base_salary: z.preprocess((val) => Number(val) || 0, z.number().optional()),
  lop_days: z.preprocess((val) => Number(val) || 0, z.number().optional()),
  lop_deduction: z.preprocess((val) => Number(val) || 0, z.number().optional()),
  total_working_days: z.preprocess((val) => Number(val) || 0, z.number().optional()),
  present_days: z.preprocess((val) => Number(val) || 0, z.number().optional()),
  approved_leave_days: z.preprocess((val) => Number(val) || 0, z.number().optional()),
  is_auto_generated: z.boolean().optional(),
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Look up admin by email (manual inserts may not have matching auth UID)
    const { data: adminEmp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!adminEmp || !['admin','ceo','cto'].includes(adminEmp.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { error } = await supabase.from('payslips').insert({
      ...parsed.data,
      uploaded_by: adminEmp.id,
      uploaded_at: new Date().toISOString()
    });
    if (error) throw error;

    // 🔔 Notify the employee their payslip is ready
    const { month, year, net_salary, employee_id } = parsed.data;

    await sendServerNotification(
      employee_id,
      `💰 Payslip Ready: ${month} ${year}`,
      `Your salary slip for ${month} ${year} is now available. Net pay: ₹${Number(net_salary).toLocaleString()}.`,
      '/payslips',
      'info'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
