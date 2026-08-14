export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import DOMPurify from 'isomorphic-dompurify';

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    // SECURE: Verify identity from the tamper-proof JWT, not the request body
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { signature_text, quiz_score, pin_verified } = await request.json();
    
    // Removed strict quiz score check as quiz is being disabled

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
    // SANITIZE: Prevent XSS in audit logs. Cap length to prevent extreme payload.
    const cleanSignature = DOMPurify.sanitize(signature_text.substring(0, 1000), { ALLOWED_TAGS: [] });

    // Get IP and User Agent for audit trail
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const ua = request.headers.get('user-agent') || 'Unknown';

    let insertPayload = {
      sop_id: id,
      employee_id: employee.id,
      acknowledged_at: new Date().toISOString(),
      pin_verified: !!pin_verified
    };

    let { data, error } = await supabase
      .from('sop_acknowledgements')
      .insert([insertPayload])
      .select();

    if (error && error.message?.includes('pin_verified')) {
      // Fallback if pin_verified column doesn't exist yet
      delete insertPayload.pin_verified;
      const fallbackRes = await supabase
        .from('sop_acknowledgements')
        .insert([insertPayload])
        .select();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) throw error;

    // Innovation 2: Task Auto-Completion
    try {
      await supabase
        .from('tasks')
        .update({ status: 'done', approval_status: 'approved' })
        .eq('assigned_to', employee.id)
        .eq('status', 'open')
        .contains('metadata', { type: 'sop_sign', sop_id: id });
    } catch (taskErr) {
      console.error('Task auto-complete error (non-fatal):', taskErr);
    }

    // Fetch SOP title for notification
    const { data: sop } = await supabase
      .from('sop_library')
      .select('title')
      .eq('id', id)
      .single();

    if (sop) {
      const { sendServerNotification } = require('@/utils/serverNotify');
      await sendServerNotification(
        employee.id,
        '📋 SOP Signed',
        `Acknowledged: "${sop.title}".`,
        '/sops',
        'info'
      ).catch(() => {});
    }

    return NextResponse.json(data[0]);
  } catch (error) {
    console.error('SOP Acknowledge Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
