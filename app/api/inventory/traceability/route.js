import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    
    // We want to link inventory_stock (lot) -> inventory_usage -> all contexts
    // Use LEFT JOINs so we see usage in Batches AND Titrations AND R&D Experiments
    let query = supabase
      .from('inventory_usage')
      .select(`
        id,
        quantity_used,
        created_at,
        stage,
        notes,
        inventory_stock!inner (
          id, supplier_batch_number,
          inventory_items (name)
        ),
        batches (
          id, batch_id, status, product_name
        ),
        titration_logs (
          id, sample_name, source_label
        ),
        bioprocess_experiments (
          id, title
        ),
        samples (
          id, sample_id, label
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200);
      
    const { data, error } = await query;
    
    if (error) throw error;
    
    let results = data.map((row) => {
      let context = 'Unknown Context';
      let contextLabel = '';

      if (row.batches?.batch_id) {
        context = 'Production Batch';
        contextLabel = `${row.batches.batch_id} — ${row.batches.product_name}`;
      } else if (row.titration_logs?.id) {
        context = 'Titration';
        contextLabel = `TA-${row.titration_logs.id.slice(0,6)}: ${row.titration_logs.sample_name}`;
      } else if (row.bioprocess_experiments?.id) {
        context = 'R&D Experiment';
        contextLabel = row.bioprocess_experiments.title;
      } else if (row.samples?.id) {
        context = 'Lab Sample';
        contextLabel = `${row.samples.sample_id} — ${row.samples.label}`;
      } else if (row.stage) {
        context = row.stage.replace('_', ' ').toUpperCase();
        contextLabel = row.notes || 'System Deduction';
      }

      return {
        id: row.id,
        date: row.created_at,
        quantity_used: row.quantity_used,
        stock_id: row.inventory_stock?.id,
        lot_number: row.inventory_stock?.supplier_batch_number || 'N/A',
        item_name: row.inventory_stock?.inventory_items?.name || 'Unknown Item',
        context,
        context_label: contextLabel,
        notes: row.notes,
        batch_uuid: row.batches?.id,
      };
    });
    
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(r => 
        r.item_name.toLowerCase().includes(q) || 
        r.lot_number.toLowerCase().includes(q) || 
        r.context_label.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
