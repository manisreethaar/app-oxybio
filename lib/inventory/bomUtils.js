export async function deductFormulationFIFO(supabase, formulationId, volumeMl, stage, sourceId, operatorId, notesPrefix) {
  if (!formulationId || !volumeMl || volumeMl <= 0) return null;

  // 1. Fetch Formulation to get ingredients and base_volume
  const { data: formulation, error: fErr } = await supabase
    .from('formulations')
    .select('base_volume_ml, ingredients, name')
    .eq('id', formulationId)
    .single();

  if (fErr || !formulation) {
    console.error('BOM Deduction: Formulation not found', fErr);
    return null;
  }

  let ingredients = [];
  if (typeof formulation.ingredients === 'string') {
    try { ingredients = JSON.parse(formulation.ingredients); } catch (e) {}
  } else if (Array.isArray(formulation.ingredients)) {
    ingredients = formulation.ingredients;
  }

  if (ingredients.length === 0) return null;

  const baseVol = formulation.base_volume_ml || 1000;
  const scaleFactor = volumeMl / baseVol;
  const logs = [];

  // 2. Process each ingredient
  for (const ing of ingredients) {
    const requiredQty = (parseFloat(ing.quantity) || 0) * scaleFactor;
    if (requiredQty <= 0) continue;

    let remainingToDeduct = requiredQty;

    // Fetch FIFO stocks for this item
    const { data: stocks, error: sErr } = await supabase
      .from('inventory_stock')
      .select('id, current_quantity, inventory_items(name, unit, min_stock_level)')
      .eq('item_id', ing.item_id)
      .eq('status', 'Available')
      .gt('current_quantity', 0)
      .order('expires_at', { ascending: true, nullsFirst: false });

    if (sErr || !stocks || stocks.length === 0) {
      logs.push(`Warning: No stock available for ${ing.name} to deduct ${requiredQty.toFixed(2)}${ing.unit}`);
      continue;
    }

    // Deduct FIFO
    for (const stock of stocks) {
      if (remainingToDeduct <= 0) break;

      const deductFromThis = Math.min(stock.current_quantity, remainingToDeduct);
      remainingToDeduct -= deductFromThis;
      const newQty = stock.current_quantity - deductFromThis;

      // Update Stock
      await supabase.from('inventory_stock').update({
        current_quantity: newQty,
        ...(newQty <= 0 ? { status: 'Out of Stock' } : {}),
      }).eq('id', stock.id);

      // Usage Log
      await supabase.from('inventory_usage').insert({
        stock_id: stock.id,
        quantity_used: deductFromThis,
        logged_by: operatorId || null,
        stage: stage,
        notes: `${notesPrefix} - Auto-deducted ${deductFromThis.toFixed(2)}${ing.unit} for ${formulation.name} (${volumeMl}ml)`,
      });

      // Movement Ledger
      await supabase.from('inventory_movements').insert({
        stock_id: stock.id,
        type: 'Batch Deduction',
        quantity: deductFromThis,
        purpose: 'Research/QC Auto-BOM',
        issued_by: operatorId || null,
        notes: `${notesPrefix} BOM Deduction: ${ing.name}`,
      });

      // Auto Restock Task
      const minLevel = parseFloat(stock.inventory_items?.min_stock_level || 0);
      if (minLevel > 0 && newQty < minLevel) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await supabase.from('tasks').insert({
          title: `Restock: ${stock.inventory_items?.name || ing.name} — below minimum`,
          description: `${notesPrefix} auto-deducted ${deductFromThis.toFixed(2)}${stock.inventory_items?.unit || ing.unit}. `
            + `Remaining: ${newQty.toFixed(1)} (min: ${minLevel}). Please reorder.`,
          priority: 'high',
          status: 'todo',
          assigned_by: operatorId || null,
          due_date: tomorrow.toISOString().slice(0, 10),
        }).catch(() => {});
      }
    }

    if (remainingToDeduct > 0) {
      logs.push(`Warning: Insufficient stock for ${ing.name}. Missed ${remainingToDeduct.toFixed(2)}${ing.unit}.`);
    }
  }

  return logs;
}
