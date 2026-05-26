// Shared query utilities for cross-module batch linking.

export async function getLinkedInventory(supabase, batchId) {
  const { data } = await supabase
    .from('inventory_usage')
    .select(`
      id, quantity_used, created_at,
      inventory_stock(
        id, supplier_batch_number, current_quantity, expiry_date,
        inventory_items(name, unit, category),
        vendors(name)
      )
    `)
    .eq('batch_id', batchId)
    .order('created_at');
  return data || [];
}

export async function getLinkedEquipment(supabase, batchId) {
  const { data } = await supabase
    .from('batch_stage_sterilisation')
    .select('equipment(id, name, model, calibration_due_date, status)')
    .eq('batch_id', batchId)
    .maybeSingle();
  const eq = data?.equipment;
  if (!eq) return [];
  return Array.isArray(eq) ? eq : [eq];
}

export async function getLinkedDeviations(supabase, batchId) {
  const { data } = await supabase
    .from('deviations')
    .select(`
      id, title, severity, status, created_at,
      investigations(
        id, root_cause_identified,
        capa_actions(id, effectiveness_verified)
      )
    `)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getLinkedLabNotebook(supabase, batchId) {
  const { data } = await supabase
    .from('lab_notebook_entries')
    .select(`
      id, title, status, created_at, flask_id,
      employees!lab_notebook_entries_created_by_fkey(full_name)
    `)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getLinkedShelfLife(supabase, batchId) {
  const { data } = await supabase
    .from('shelf_life_studies')
    .select('id, storage_condition, test_parameters, created_at, status')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getLinkedIncubation(supabase, batchId) {
  const { data } = await supabase
    .from('sample_incubation_records')
    .select(`
      id, sample_name, sample_type, sample_category, source_stage,
      start_time, end_time, duration_hours, incubation_temp_c,
      sterility_status,
      batch_flasks(flask_label)
    `)
    .eq('batch_id', batchId)
    .order('start_time', { ascending: false });
  return data || [];
}

export async function getLinkedTasks(supabase, batchId) {
  const { data: devs } = await supabase
    .from('deviations')
    .select('id')
    .eq('batch_id', batchId);
  if (!devs?.length) return [];

  const { data: invs } = await supabase
    .from('investigations')
    .select('id')
    .in('deviation_id', devs.map(d => d.id));
  if (!invs?.length) return [];

  const { data: capas } = await supabase
    .from('capa_actions')
    .select('task_id')
    .in('investigation_id', invs.map(i => i.id))
    .not('task_id', 'is', null);
  if (!capas?.length) return [];

  const taskIds = capas.map(c => c.task_id).filter(Boolean);
  if (!taskIds.length) return [];

  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id, title, due_date, priority, status,
      employees!tasks_assigned_to_fkey(full_name)
    `)
    .in('id', taskIds)
    .order('due_date');
  return tasks || [];
}
