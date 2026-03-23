import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  variant: z.string().min(1, 'Variant required'),
  formulation_id: z.string().uuid('Invalid formulation ID'),
  equipment_id: z.string().uuid('Invalid equipment ID')
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { variant, formulation_id, equipment_id } = parsed.data;

    // Innovation 6: Auto-Inhibitor Hook (Server-side)
    const { data: equip, error: equipErr } = await supabase
      .from('equipment')
      .select('status, calibration_due_date')
      .eq('id', equipment_id)
      .single();

    if (equipErr || !equip) return NextResponse.json({ error: 'Selected equipment not found' }, { status: 404 });

    const isOutOfService = equip.status !== 'Operational';
    const isExpired = equip.calibration_due_date && (new Date(equip.calibration_due_date) < new Date());

    if (isOutOfService || isExpired) {
      return NextResponse.json({ 
        error: 'AUTO-INHIBITOR: Selected equipment is non-compliant or out of calibration.', 
        details: { status: equip.status, calibration_due: equip.calibration_due_date }
      }, { status: 403 });
    }

    const salt = crypto.randomUUID().split('-')[0].slice(-4).toUpperCase();
    const batchIdStr = `BTCH-${variant.split('-')[1]?.toUpperCase() || 'VAR'}-${salt}`;

    const { data, error } = await supabase.from('batches').insert({ 
      batch_id: batchIdStr, 
      variant: variant, 
      formulation_id: formulation_id,
      equipment_id: equipment_id, 
      current_stage: 'media_prep', 
      status: 'pending', 
      start_time: new Date().toISOString() 
    }).select().single();

    if (error) throw error;
    const newBatch = data;

    // Innovation 7: Formula-Linked Inventory Deduction (Automated Reconciliation)
    const { data: formulation, error: formErr } = await supabase
      .from('formulations')
      .select('ingredients')
      .eq('id', formulation_id)
      .single();

    if (!formErr && formulation?.ingredients) {
      let ingredients = [];
      try { ingredients = JSON.parse(formulation.ingredients); } catch(e) { ingredients = []; }

      for (const ing of ingredients) {
        if (!ing.item_id || !ing.quantity) continue;

        // Fetch available stock for this item, sorted by expiry (FIFO)
        const { data: stocks, error: stockErr } = await supabase
          .from('inventory_stock')
          .select('id, current_quantity')
          .eq('item_id', ing.item_id)
          .gt('current_quantity', 0)
          .order('expiry_date', { ascending: true });

        if (stockErr || !stocks) continue;

        let remainingToDeduct = ing.quantity;
        for (const stock of stocks) {
          if (remainingToDeduct <= 0) break;

          const deductAmount = Math.min(stock.current_quantity, remainingToDeduct);
          const newQty = stock.current_quantity - deductAmount;

          await supabase
            .from('inventory_stock')
            .update({ current_quantity: newQty })
            .eq('id', stock.id);

          remainingToDeduct -= deductAmount;
        }

        // Optional: Log a warning if we couldn't fulfill the entire ingredient requirement
        if (remainingToDeduct > 0) {
          console.warn(`INVENTORY DRIFT: Could not fully deduct ${ing.name}. Missing: ${remainingToDeduct}`);
        }
      }
    }
    
    return NextResponse.json({ success: true, data: newBatch });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
