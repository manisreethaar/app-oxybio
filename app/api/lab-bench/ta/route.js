import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = createClient();
    
    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!profile) {
       return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 401 });
    }

    const body = await request.json();
    const { inventory_item_id, ...payload } = body;
    payload.logged_by = profile.id;
    payload.sampled_at = new Date().toISOString();
    
    // Calculate titrant volume mathematically
    const titrantVol = (parseFloat(payload.final_burette_ml) || 0) - (parseFloat(payload.initial_burette_ml) || 0);

    // 1. Insert Titration Log
    // (We also insert the inventory_item_id if the DB schema supports it, but if it throws an error we remove it and try again)
    let logData, logError;
    const finalPayload = { ...payload };
    if (inventory_item_id) finalPayload.inventory_item_id = inventory_item_id;

    ({ data: logData, error: logError } = await supabase.from('titration_logs').insert(finalPayload).select().single());
    
    if (logError) {
      // Fallback: If inventory_item_id column doesn't exist yet, retry without it
      if (logError.code === '42703' && inventory_item_id) { // column does not exist
         ({ data: logData, error: logError } = await supabase.from('titration_logs').insert(payload).select().single());
      }
      if (logError) throw logError;
    }

    const deductionLogs = [];

    // 2. Perform Inventory Deduction if requested
    if (inventory_item_id && titrantVol > 0) {
      const deductionQty = titrantVol;

      // Find oldest available stock for this item (FIFO)
      const { data: stocks, error: stockErr } = await supabase
        .from('inventory_stock')
        .select('id, current_quantity, batch_number')
        .eq('item_id', inventory_item_id)
        .in('status', ['Available', 'In Use'])
        .gt('current_quantity', 0)
        .order('expiry_date', { ascending: true })
        .order('received_date', { ascending: true });

      if (stockErr) throw stockErr;

      let remainingToDeduct = deductionQty;

      if (!stocks || stocks.length === 0) {
        deductionLogs.push(`Warning: No stock available to deduct ${deductionQty} mL.`);
      } else {
        for (const stock of stocks) {
          if (remainingToDeduct <= 0) break;
          
          const qtyInStock = parseFloat(stock.current_quantity);
          const qtyDeductedFromThis = Math.min(qtyInStock, remainingToDeduct);
          
          const { error: deductErr } = await supabase.rpc('deduct_inventory_stock', {
            id_to_deduct: stock.id,
            quantity_to_deduct: qtyDeductedFromThis
          });

          if (!deductErr) {
             // Log movement
             await supabase.from('inventory_movements').insert({
                stock_id: stock.id,
                type: 'Issue',
                quantity: qtyDeductedFromThis,
                purpose: 'Titration Analysis',
                notes: `Auto-deducted for TA Lab. Sample: ${payload.sample_name}`,
                issued_by: profile.id
             });
             remainingToDeduct -= qtyDeductedFromThis;
             deductionLogs.push(`Deducted ${qtyDeductedFromThis} mL from lot ${stock.batch_number || stock.id}`);
          }
        }
        
        if (remainingToDeduct > 0) {
          deductionLogs.push(`Warning: Partially deducted. Short by ${remainingToDeduct} mL.`);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: logData,
      deductionLogs 
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
