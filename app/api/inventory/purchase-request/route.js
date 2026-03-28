import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { item_id, item_name, requested_quantity, unit, reason, urgency = 'Normal' } = body;

    if (!item_name || !requested_quantity) {
      return NextResponse.json({ error: 'item_name and requested_quantity are required' }, { status: 400 });
    }

    // Get employee record
    const { data: emp } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('email', user.email)
      .single();

    // Insert the purchase request
    const { data: pr, error: prError } = await supabase
      .from('purchase_requests')
      .insert({
        item_id: item_id || null,
        item_name,
        requested_quantity: parseFloat(requested_quantity),
        unit: unit || '',
        reason: reason || '',
        urgency,
        requested_by: emp?.id || null,
        status: 'Pending'
      })
      .select()
      .single();

    if (prError) throw prError;

    // Notify all admins
    const { data: admins } = await supabase
      .from('employees')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (admins && admins.length > 0) {
      const notifications = admins.map(admin => ({
        employee_id: admin.id,
        title: `📦 Purchase Request: ${item_name}`,
        message: `${emp?.full_name || 'A team member'} has requested ${requested_quantity} ${unit} of "${item_name}". Urgency: ${urgency}.`,
        url: '/inventory',
        is_read: false
      }));
      await supabase.from('notifications').insert(notifications);
    }

    return NextResponse.json({ success: true, data: pr });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('purchase_requests')
      .select('*, requester:employees!purchase_requests_requested_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, status } = await request.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });

    const { data, error } = await supabase
      .from('purchase_requests')
      .update({ status, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
