import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json();
    const { stock_id, quantity_issued, purpose, notes, batch_reference } = body;

    const qtyValue = parseFloat(quantity_issued);
    if (!stock_id || isNaN(qtyValue) || qtyValue <= 0) {
      return NextResponse.json({ success: false, error: 'Valid Stock ID and Quantity are required' }, { status: 400 });
    }

    // 1. Fetch current stock balance
    const { data: stockEntry, error: stockFetchError } = await supabase
      .from('inventory_stock')
      .select('current_quantity, item_id, inventory_items(name, min_stock_level)')
      .eq('id', stock_id)
      .single();

    if (stockFetchError || !stockEntry) {
      return NextResponse.json({ success: false, error: 'Stock record not found' }, { status: 404 });
    }

    const currentQty = parseFloat(stockEntry.current_quantity);
    if (qtyValue > currentQty) {
      return NextResponse.json({ success: false, error: `Insufficient stock. Max available: ${currentQty}` }, { status: 400 });
    }

    const newQty = currentQty - qtyValue;

    // 2. Update stock table balances
    const { error: updateError } = await supabase
      .from('inventory_stock')
      .update({ current_quantity: newQty, status: newQty <= 0 ? 'Expired' : undefined }) // Update status to reflect out of stock on Aggregate setups or keep as Available
      .eq('id', stock_id);

    if (updateError) throw updateError;

    // 3. Append to inventory_movements ledger
    const { error: moveError } = await supabase
      .from('inventory_movements')
      .insert({
        stock_id,
        type: 'Issue',
        quantity: qtyValue,
        purpose,
        notes: batch_reference ? `Batch: ${batch_reference}. ${notes || ''}` : notes,
        issued_by: user?.id
      });

    if (moveError) throw moveError;

    // 4. Notification Triggers placeholder
    const minLevel = parseFloat(stockEntry.inventory_items?.min_stock_level) || 0;
    let notification = null;
    if (newQty <= 0) {
       notification = `CRITICAL — ${stockEntry.inventory_items?.name} is out of stock.`;
    } else if (newQty < minLevel) {
       notification = `${stockEntry.inventory_items?.name} running low — ${newQty} remaining.`;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Stock issued successfully. Deducted ${qtyValue}`,
      notification 
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
