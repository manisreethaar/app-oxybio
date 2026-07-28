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

/**
 * Deducts a specified quantity of a single inventory item using a FIFO approach.
 * Automatically loops through active lots, oldest first, and logs usage to ALCOA++ traceability.
 * 
 * @param {object} supabase - Supabase client
 * @param {string} itemId - UUID of the inventory_items row (the generic chemical/reagent)
 * @param {number} volumeMl - Amount to deduct
 * @param {string} stage - Process stage (e.g., 'titration', 'lab_bench')
 * @param {string} operatorId - Employee UUID performing the action
 * @param {string} notesPrefix - Prefix for notes (e.g., "Titration Log TA-101:")
 * @param {object} references - Object of foreign keys for traceability (e.g. { titration_id: 'uuid', sample_id: 'uuid', experiment_id: 'uuid' })
 */
export async function deductItemFIFO(supabase, itemId, volumeMl, stage, operatorId, notesPrefix, references = {}) {
  if (!itemId || !volumeMl || volumeMl <= 0) return null;

  const logs = [];
  let remainingToDeduct = parseFloat(volumeMl);

  // 1. Fetch Item Info
  const { data: item, error: iErr } = await supabase
    .from('inventory_items')
    .select('name, unit, min_stock_level')
    .eq('id', itemId)
    .single();

  if (iErr || !item) {
    console.error('FIFO Deduction: Item not found', iErr);
    return null;
  }

  // 2. Fetch FIFO stocks for this item
  const { data: stocks, error: sErr } = await supabase
    .from('inventory_stock')
    .select('id, current_quantity, supplier_batch_number, expires_at')
    .eq('item_id', itemId)
    .eq('status', 'Available')
    .gt('current_quantity', 0)
    .order('expires_at', { ascending: true, nullsFirst: false });

  if (sErr || !stocks || stocks.length === 0) {
    logs.push(`Warning: No stock available for ${item.name} to deduct ${remainingToDeduct.toFixed(2)}${item.unit}`);
    return logs;
  }

  // 3. Deduct FIFO
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

    // Usage Log (Traceability)
    await supabase.from('inventory_usage').insert({
      stock_id: stock.id,
      quantity_used: deductFromThis,
      logged_by: operatorId || null,
      stage: stage,
      notes: `${notesPrefix} - Auto-deducted ${deductFromThis.toFixed(2)}${item.unit} of Lot ${stock.supplier_batch_number}`,
      titration_id: references.titration_id || null,
      sample_id: references.sample_id || null,
      experiment_id: references.experiment_id || null,
      batch_id: references.batch_id || null,
    });

    // Movement Ledger
    await supabase.from('inventory_movements').insert({
      stock_id: stock.id,
      type: 'Batch Deduction',
      quantity: deductFromThis,
      purpose: stage === 'titration' ? 'Analytical Titration' : 'Lab Quick Log',
      issued_by: operatorId || null,
      notes: `${notesPrefix} FIFO Deduction: ${item.name} (Lot ${stock.supplier_batch_number})`,
    });

    // Auto Restock Task
    const minLevel = parseFloat(item.min_stock_level || 0);
    if (minLevel > 0 && newQty < minLevel) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await supabase.from('tasks').insert({
        title: `Restock: ${item.name} — below minimum`,
        description: `${notesPrefix} auto-deducted ${deductFromThis.toFixed(2)}${item.unit}. `
          + `Remaining: ${newQty.toFixed(1)} (min: ${minLevel}). Please reorder.`,
        priority: 'high',
        status: 'todo',
        assigned_by: operatorId || null,
        due_date: tomorrow.toISOString().slice(0, 10),
      }).catch(() => {});
    }
  }

  if (remainingToDeduct > 0) {
    logs.push(`Warning: Insufficient stock for ${item.name}. Missed ${remainingToDeduct.toFixed(2)}${item.unit}.`);
  }

  return logs;
}
