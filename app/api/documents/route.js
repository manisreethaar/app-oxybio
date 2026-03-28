import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  title: z.string().min(1, 'Title required'),
  category: z.string().min(1, 'Category required'),
  version: z.string().min(1, 'Version required'),
  file_url: z.string().min(1, 'File URL required'),
  access_level: z.enum(['all-staff', 'management-only', 'admin-only'])
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms));
    
    const { data: { user }, error: authError } = await Promise.race([
        supabase.auth.getUser(),
        timeout(5000)
    ]).catch(err => ({ data: { user: null }, error: err }));
    
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized or Auth Timeout' }, { status: 401 });

    const { data: emp, error: empError } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (!['admin','ceo','cto'].includes(emp.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const docId = `DOC-${Date.now().toString(36).toUpperCase().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;

    const { error } = await supabase.from('documents').insert({
      doc_id: docId,
      ...parsed.data,
      effective_date: new Date().toISOString(),
      created_by: emp.id
    });

    if (error) throw error;
    
    return NextResponse.json({ success: true, doc_id: docId });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
