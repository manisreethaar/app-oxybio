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

    const { data, error } = await supabase.from('leave_applications').update(updateData).eq('id', id).select('*, employees(full_name)').single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
