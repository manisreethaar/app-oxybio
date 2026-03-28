import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const sopSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.enum(['Fermentation', 'QC', 'Sanitation', 'Safety']),
  version: z.string().min(1, "Version is required"),
  document_url: z.string().url("Valid document URL is required")
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!['admin','ceo','cto','research_fellow'].includes(emp?.role)) {
      return NextResponse.json({ error: 'Permission Denied: Leadership role required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = sopSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { title, category, version, document_url } = parsed.data;
    const sop_id = `SOP-${Date.now().toString(36).toUpperCase().slice(-4)}`;

    const { data, error } = await supabase
      .from('sop_library')
      .insert({ 
        sop_id, 
        title, 
        category, 
        version, 
        document_url, 
        is_active: true 
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('SOP Create API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
