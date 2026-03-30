import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const patchSchema = z.object({
  full_name: z.string().optional().nullable(),
  employee_code: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  blood_group: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  joined_date: z.string().optional().nullable(),
  base_salary: z.number().optional().nullable()
});

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms));
    
    const { data: { user }, error: authError } = await Promise.race([
        supabase.auth.getUser(),
        timeout(5000)
    ]).catch(err => ({ data: { user: null }, error: err }));

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized or Auth Timeout' }, { status: 401 });
    } 
    const body = await request.json();
    
    // Authorization Check for Admin View Updates
    const isTargetingOther = body.id && body.id !== user.id;
    let targetEmail = user.email;
    let targetId = null;

    if (isTargetingOther) {
      const { data: adminRecord } = await supabase.from('employees').select('role').eq('id', user.id).single();
      if (!adminRecord || !['admin', 'ceo', 'cto'].includes(adminRecord.role)) {
        return NextResponse.json({ error: 'Forbidden: Admin access required to edit other profiles' }, { status: 403 });
      }
      targetId = body.id;
    }

    const { id, ...rest } = body;
    const parsed = patchSchema.safeParse(rest);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const updateData = { ...parsed.data };
    // Clean up empty strings or undefined for date fields
    if (updateData.date_of_birth === '') updateData.date_of_birth = null;
    if (updateData.joined_date === '') updateData.joined_date = null;

    let query = supabase.from('employees').update(updateData);
    if (targetId) {
      query = query.eq('id', targetId);
    } else {
      query = query.eq('id', user.id);
    }

    const { error } = await query;
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
