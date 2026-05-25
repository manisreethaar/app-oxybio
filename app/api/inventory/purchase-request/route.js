import { createClient } from '@/utils/supabase/server';
import { notifyAdmins } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '../_permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'request_stock');
    if (permission.error) return permission.error;

    const body = await request.json();
    const { item_id, item_name, requested_quantity, unit, reason, urgency = 'Normal' } = body;
    const qtyValue = parseFloat(requested_quantity);

    if (!item_name || isNaN(qtyValue) || qtyValue <= 0) {
      return NextResponse.json({ error: 'item_name and a valid requested_quantity are required' }, { status: 400 });
    }

    const { data: emp } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('email', permission.user.email)
      .single();

    const { data: pr, error: prError } = await supabase
      .from('purchase_requests')
      .insert({
        item_id: item_id || null,
        item_name,
        requested_quantity: qtyValue,
        unit: unit || '',
        reason: reason || '',
        urgency,
        requested_by: emp?.id || null,
        status: 'Pending'
      })
      .select()
      .single();

    if (prError) throw prError;

    await notifyAdmins(
      `Purchase Request: ${item_name}`,
      `${emp?.full_name || 'A team member'} has requested ${qtyValue} ${unit || ''} of "${item_name}". Urgency: ${urgency}.`,
      '/inventory'
    );

    return NextResponse.json({ success: true, data: pr });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'view');
    if (permission.error) return permission.error;

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
    const permission = await requireInventoryPermission(supabase, 'approve_request');
    if (permission.error) return permission.error;

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
