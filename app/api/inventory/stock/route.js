import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '../_permissions';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Generate sequential internal lot number: OB-LOT-YY-NNN
// Used when no supplier batch number is provided (in-house lots)
// ─────────────────────────────────────────────────────────────
async function generateLotNumber(supabase) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `OB-LOT-${yy}-`;
  const { data: last } = await supabase
    .from('inventory_stock')
    .select('supplier_batch_number')
    .like('supplier_batch_number', `${prefix}%`)
    .order('supplier_batch_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (last?.supplier_batch_number) {
    const n = parseInt(last.supplier_batch_number.split('-').pop(), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export async function GET() {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'view');
    if (permission.error) return permission.error;

    const { data, error } = await supabase
      .from('inventory_stock')
      .select('*, inventory_items(name, unit), vendors(name)')
      .order('expiry_date', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'edit');
    if (permission.error) return permission.error;

    const body = await request.json();
    const { item_id, vendor_id, supplier_batch_number, received_quantity, expiry_date, location, purchase_order_number, invoice_ref, condition_on_arrival, sds_url, coa_url } = body;

    const qtyValue = parseFloat(received_quantity);
    if (!item_id || isNaN(qtyValue) || qtyValue <= 0) {
      return NextResponse.json({ success: false, error: 'Valid Quantity greater than 0 is required' }, { status: 400 });
    }

    // Auto-generate internal lot number when supplier doesn't provide one
    const resolvedLotNumber = supplier_batch_number?.trim()
      ? supplier_batch_number.trim()
      : await generateLotNumber(supabase);

    // Fetch item category to determine auto-quarantine status
    const { data: itemData, error: itemError } = await supabase
      .from('inventory_items')
      .select('category')
      .eq('id', item_id)
      .single();

    if (itemError) throw new Error("Verification failed: Item category not found.");

    let status = 'Available';
    const quarantineCats = ['Raw Material', 'Active Ingredient', 'Reference Standard'];
    if (quarantineCats.includes(itemData.category)) {
      status = 'Quarantine';
    }

    const { data, error } = await supabase
      .from('inventory_stock')
      .insert({
        item_id,
        vendor_id,
        supplier_batch_number: resolvedLotNumber,
        received_quantity: qtyValue,
        current_quantity: qtyValue,
        expiry_date,
        location,
        status,
        purchase_order_number,
        invoice_ref,
        condition_on_arrival,
        sds_url,
        coa_url
      })
      .select()
      .single();

    if (error) throw error;

    const { error: movementError } = await supabase
      .from('inventory_movements')
      .insert({
        stock_id: data.id,
        type: 'Receive',
        quantity: qtyValue,
        purpose: 'Stock Receipt',
        notes: [
          purchase_order_number ? `PO: ${purchase_order_number}` : null,
          invoice_ref ? `Invoice/Ref: ${invoice_ref}` : null,
          condition_on_arrival ? `Condition: ${condition_on_arrival}` : null
        ].filter(Boolean).join('. '),
        issued_by: permission.user.id
      });

    if (movementError) {
      await supabase.from('inventory_stock').delete().eq('id', data.id);
      throw movementError;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'edit');
    if (permission.error) return permission.error;

    const body = await request.json();
    const { id, vendor_id, supplier_batch_number, current_quantity, expiry_date, location, purchase_order_number, invoice_ref, condition_on_arrival, sds_url, coa_url, notes } = body;

    if (!id) return NextResponse.json({ success: false, error: 'Stock ID required' }, { status: 400 });

    const valQty = parseFloat(current_quantity);
    if (isNaN(valQty) || valQty < 0) return NextResponse.json({ success: false, error: 'Valid quantity required' }, { status: 400 });

    const { data, error } = await supabase
      .from('inventory_stock')
      .update({
        vendor_id,
        supplier_batch_number,
        current_quantity: valQty,
        expiry_date,
        location,
        purchase_order_number,
        invoice_ref,
        condition_on_arrival,
        sds_url,
        coa_url,
        notes
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
