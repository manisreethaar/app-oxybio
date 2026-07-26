import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const { data: study, error } = await supabase
      .from('growth_studies')
      .select(`
        id, study_code, name, volume_ml, vial_id,
        formulations(id, name, base_volume_ml, ingredients),
        cell_bank_vials(id, vial_code, storage_temp, freezer_id, rack, box, position)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Parse formulation ingredients and calculate scaled quantities
    let ingredients = [];
    if (study.formulations && study.volume_ml) {
      const raw = study.formulations.ingredients;
      const ingList = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
      const baseVol = study.formulations.base_volume_ml || 1000;
      const scaleFactor = study.volume_ml / baseVol;

      // Fetch available lots for each ingredient
      const itemIds = ingList.map(i => i.item_id || i.inventory_item_id).filter(Boolean);
      const { data: lots } = itemIds.length
        ? await supabase
            .from('inventory_stock')
            .select('id, supplier_batch_number, current_quantity, expiry_date, location, item_id')
            .in('item_id', itemIds)
            .eq('status', 'Available')
            .gt('current_quantity', 0)
            .order('expiry_date', { ascending: true })
        : { data: [] };

      const lotsByItem = {};
      (lots || []).forEach(l => {
        if (!lotsByItem[l.item_id]) lotsByItem[l.item_id] = [];
        lotsByItem[l.item_id].push(l);
      });

      ingredients = ingList.map(ing => {
        const itemId = ing.item_id || ing.inventory_item_id;
        const qty = parseFloat(ing.quantity || 0) * scaleFactor;
        return {
          item_id: itemId,
          name: ing.name || ing.item_name || 'Unknown',
          quantity_needed: parseFloat(qty.toFixed(4)),
          unit: ing.unit || 'g',
          notes: ing.notes || null,
          available_lots: lotsByItem[itemId] || [],
        };
      });
    }

    return NextResponse.json({
      vial: study.cell_bank_vials || null,
      ingredients,
      has_formulation: !!study.formulations,
      has_vial: !!study.vial_id,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
