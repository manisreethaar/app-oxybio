import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { batchId, formData } = await request.json();
    if (!batchId || !formData) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    const ingredients = formData.ingredients || [];
    
    // Deduct each ingredient from inventory_stock
    for (const ing of ingredients) {
      if (!ing.stock_id || !ing.amount) continue;
      
      const { data: stock, error: fetchErr } = await supabase
        .from('inventory_stock')
        .select('current_quantity')
        .eq('id', ing.stock_id)
        .single();
        
      if (fetchErr || !stock) throw new Error(`Stock not found for ${ing.stock_id}`);
      
      const amountToDeduct = parseFloat(ing.amount);
      if (isNaN(amountToDeduct) || amountToDeduct <= 0) continue;
      
      if (stock.current_quantity < amountToDeduct) {
        throw new Error(`Insufficient stock for ingredient ID ${ing.stock_id}. Has ${stock.current_quantity}, requested ${amountToDeduct}`);
      }
      
      const { error: updErr } = await supabase
        .from('inventory_stock')
        .update({ current_quantity: stock.current_quantity - amountToDeduct })
        .eq('id', ing.stock_id);
        
      if (updErr) throw new Error(`Failed to deduct stock for ${ing.stock_id}`);
    }

    // Update batch notes with formulation record
    const { data: batch, error: bErr } = await supabase.from('batches').select('notes').eq('id', batchId).single();
    if (bErr) throw new Error('Batch not found');

    const formulationRecord = `
[RTD Formulation Log - ${new Date().toISOString()}]
Target Volume: ${formData.target_volume} ml
Target pH: ${formData.target_ph}
Target Brix: ${formData.target_brix}
Ingredients Consumed:
${ingredients.map(i => `- Stock ID: ${i.stock_id}, Amount: ${i.amount}`).join('\n')}
Process Notes: ${formData.notes}
----------------------------------------`;

    const newNotes = batch.notes ? `${batch.notes}\n${formulationRecord}` : formulationRecord;

    const { error: updBatchErr } = await supabase
      .from('batches')
      .update({
        notes: newNotes,
        planned_volume_ml: formData.target_volume
      })
      .eq('id', batchId);

    if (updBatchErr) throw new Error('Failed to update batch');

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
