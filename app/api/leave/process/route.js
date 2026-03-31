import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const processSchema = z.object({
  id: z.string().uuid('Invalid leave ID'),
  status: z.enum(['approved', 'rejected']),
  comment: z.string().optional()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp, error: empError } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (!['admin','ceo','cto'].includes(emp.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const parsed = processSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { id, status, comment } = parsed.data;

    if (status === 'rejected' && (!comment || comment.trim().length < 5)) {
      return NextResponse.json({ error: 'A mandatory rejection reason (min 5 characters) is required.' }, { status: 400 });
    }

    const updateData = {
      status,
      admin_comment: comment || '',
      reviewed_by: emp.id,
      reviewed_at: new Date().toISOString()
    };

    if (status === 'rejected') {
        updateData.rejection_reason = comment;
    }

    const { data, error } = await supabase.from('leave_applications').update(updateData).eq('id', id).select('*, employees(id, role, casual_leave_balance, medical_leave_balance, earned_leave_balance)').single();

    if (error) throw error;

    // Decrement the stored leave balance for permanent staff when approved
    if (status === 'approved' && data?.employees) {
      const empRole = data.employees.role?.toLowerCase();
      const leaveType = data.leave_type;
      const totalDays = data.total_days || 0;
      const clOnlyRoles = ['intern', 'research_intern'];

      // Only decrement stored balances for permanent staff (interns use dynamic DOJ calc)
      if (!clOnlyRoles.includes(empRole) && totalDays > 0) {
        let balanceField = null;
        if (leaveType === 'Casual') balanceField = 'casual_leave_balance';
        else if (leaveType === 'Sick' || leaveType === 'Medical') balanceField = 'medical_leave_balance';
        else if (leaveType === 'Earned') balanceField = 'earned_leave_balance';

        if (balanceField) {
          const currentBalance = data.employees[balanceField] || 0;
          await supabase.from('employees').update({
            [balanceField]: Math.max(0, currentBalance - totalDays)
          }).eq('id', data.employees.id);
        }
      }
    }

    return NextResponse.json({ success: true, data });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
