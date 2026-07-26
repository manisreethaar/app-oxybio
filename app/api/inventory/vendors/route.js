import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventory/access';

export const dynamic = 'force-dynamic';

// Replaces the previous direct-from-client supabase.from('vendors') calls in
// InventoryClient.tsx. Those bypassed both the app's role gating (RLS on
// vendors only checks `authenticated`, not `canDo('inventory', ...)`) and left
// no `updated_by`/`archived_by` attribution — this route restores both.

export async function GET() {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'view');
    if (permission.error) return permission.error;

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .is('archived_at', null)
      .order('name');

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'create');
    if (permission.error) return permission.error;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();

    const { name, contact_person, email, phone, address, payment_terms, lead_time, status, qualification_status, qualified_at, qualification_notes, audit_due_date } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Vendor name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name,
        contact_person,
        email,
        phone,
        address,
        payment_terms,
        lead_time,
        status: status || 'Approved',
        qualification_status: qualification_status || 'Unqualified',
        qualified_at: qualified_at || null,
        qualification_notes,
        audit_due_date: audit_due_date || null,
        created_by: emp?.id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'create');
    if (permission.error) return permission.error;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();

    const body = await request.json();
    const { id, name, contact_person, email, phone, address, payment_terms, lead_time, status, qualification_status, qualified_at, qualification_notes, audit_due_date } = body;

    if (!id || !name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Vendor ID and name are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vendors')
      .update({
        name,
        contact_person,
        email,
        phone,
        address,
        payment_terms,
        lead_time,
        status,
        qualification_status,
        qualified_at: qualified_at || null,
        qualification_notes,
        audit_due_date: audit_due_date || null,
        updated_by: emp?.id || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'delete');
    if (permission.error) return permission.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Vendor ID required' }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();

    // Unlink from any items that name this vendor as preferred supplier
    // before archiving, same as the previous client-side behaviour — now
    // attributed to the same employee performing the archive.
    const { error: unlinkError } = await supabase
      .from('inventory_items')
      .update({ preferred_supplier: null, updated_by: emp?.id || null })
      .eq('preferred_supplier', id);
    if (unlinkError) throw unlinkError;

    // Soft delete — keeps the vendor's history (and every stock/movement
    // record that references it) intact and recoverable, instead of a hard
    // DELETE destroying it outright.
    const { error } = await supabase
      .from('vendors')
      .update({ archived_at: new Date().toISOString(), archived_by: emp?.id || null })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Vendor archived.' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
