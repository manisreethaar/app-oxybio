import { createClient } from '@/utils/supabase/server';
import { notifyAdmins } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '../_permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'edit');
    if (permission.error) return permission.error;

    const body = await request.json();
    const { stock_id, quantity_issued, purpose, notes, batch_reference } = body;

    const qtyValue = parseFloat(quantity_issued);
    if (!stock_id || isNaN(qtyValue) || qtyValue <= 0) {
      return NextResponse.json({ success: false, error: 'Valid Stock ID and Quantity are required' }, { status: 400 });
    }

    const { data: stockEntry, error: stockFetchError } = await supabase
      .from('inventory_stock')
      .select('current_quantity, item_id, inventory_items(name, min_stock_level)')
      .eq('id', stock_id)
      .single();

    if (stockFetchError || !stockEntry) {
      return NextResponse.json({ success: false, error: 'Stock record not found' }, { status: 404 });
    }

    const { error: updateError } = await supabase.rpc('deduct_inventory_stock', {
      id_to_deduct: stock_id,
      quantity_to_deduct: qtyValue
    });

    if (updateError) {
      return NextResponse.json({
        success: false,
        error: 'Concurrency error or insufficient stock. The inventory level changed or was too low.'
      }, { status: 409 });
    }

    const { data: updatedStock, error: updatedFetchError } = await supabase
      .from('inventory_stock')
      .select('current_quantity')
      .eq('id', stock_id)
      .single();

    if (updatedFetchError || !updatedStock) {
      throw updatedFetchError || new Error('Unable to verify updated stock balance');
    }

    const newQty = parseFloat(updatedStock.current_quantity);
    if (newQty <= 0) {
      await supabase
        .from('inventory_stock')
        .update({ status: 'Out of Stock' })
        .eq('id', stock_id);
    }

    const { error: moveError } = await supabase
      .from('inventory_movements')
      .insert({
        stock_id,
        type: 'Issue',
        quantity: qtyValue,
        purpose,
        notes: batch_reference ? `Batch: ${batch_reference}. ${notes || ''}` : notes,
        issued_by: permission.user.id
      });

    if (moveError) throw moveError;

    const minLevel = parseFloat(stockEntry.inventory_items?.min_stock_level) || 0;
    let notification = null;
    if (newQty <= 0) {
      notification = `CRITICAL - ${stockEntry.inventory_items?.name} is out of stock.`;
      await notifyAdmins('Out of Stock', notification, '/inventory', 'alert');
    } else if (newQty < minLevel) {
      notification = `${stockEntry.inventory_items?.name} running low - ${newQty} remaining.`;
      await notifyAdmins('Low Stock Alert', notification, '/inventory', 'warning');
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
