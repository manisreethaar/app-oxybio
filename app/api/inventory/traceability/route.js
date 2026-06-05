import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    
    // We want to link inventory_stock (lot) -> inventory_usage -> batches
    
    // 1. Fetch all inventory_usage records with stock and batch data
    // Filter strictly for records that link a stock lot to a production batch
    let query = supabase
      .from('inventory_usage')
      .select(`
        id,
        quantity_used,
        created_at,
        inventory_stock!inner (
          id, supplier_batch_number,
          inventory_items (name)
        ),
        batches!inner (
          id, batch_id, status, product_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200);
      
    const { data, error } = await query;
    
    if (error) throw error;
    
    // 2. Map and filter by search if needed
    let results = data.map((row) => ({
      id: row.id,
      date: row.created_at,
      quantity_used: row.quantity_used,
      stock_id: row.inventory_stock?.id,
      lot_number: row.inventory_stock?.supplier_batch_number || 'N/A',
      item_name: row.inventory_stock?.inventory_items?.name || 'Unknown Item',
      batch_id: row.batches?.batch_id || 'Unknown',
      batch_status: row.batches?.status || 'Unknown',
      product_name: row.batches?.product_name || 'N/A',
      batch_uuid: row.batches?.id,
    }));
    
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(r => 
        r.item_name.toLowerCase().includes(q) || 
        r.lot_number.toLowerCase().includes(q) || 
        r.batch_id.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
