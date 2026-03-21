import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import DOMPurify from 'isomorphic-dompurify';

export async function POST(request, { params }) {
  const supabase = createClient();
  const { id } = params;
  
  // SECURE: Verify identity from the tamper-proof JWT, not the request body
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { signature_text } = await request.json();

  if (!signature_text) {
    return NextResponse.json({ error: 'Missing signature text' }, { status: 400 });
  }

  // Get the internal employee ID for this user
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('email', user.email)
    .single();

  if (!employee) {
    return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });
  }

  // SANITIZE: Prevent XSS in audit logs
  const cleanSignature = DOMPurify.sanitize(signature_text, { ALLOWED_TAGS: [] });

  // Get IP and User Agent for audit trail
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const ua = request.headers.get('user-agent') || 'Unknown';

  const { data, error } = await supabase
    .from('sop_acknowledgements')
    .insert([
      {
        sop_id: id,
        employee_id: employee.id,
        signature_text: cleanSignature,
        ip_address: ip,
        user_agent: ua,
        acknowledged_at: new Date().toISOString()
      }
    ])
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}
