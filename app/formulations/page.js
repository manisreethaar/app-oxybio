import { createClient } from '@/utils/supabase/server';
import FormulationsClient from './FormulationsClient';

export default async function FormulationsPage() {
  const supabase = createClient();

  // 1. Fetch formulations
  const { data: formulationsData } = await supabase
    .from('formulations')
    .select('*')
    .neq('status', 'Archived')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  let initialFormulations = formulationsData || [];

  if (initialFormulations.length > 0) {
    const empIds = new Set();
    initialFormulations.forEach(f => {
      if (f.created_by) empIds.add(f.created_by);
      if (f.approved_by) empIds.add(f.approved_by);
    });

    if (empIds.size > 0) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name, initials')
        .in('id', Array.from(empIds));
        
      const empMap = {};
      (emps || []).forEach(e => { empMap[e.id] = e; });
      
      initialFormulations = initialFormulations.map(f => ({
        ...f,
        creator: f.created_by ? empMap[f.created_by] : null,
        approver: f.approved_by ? empMap[f.approved_by] : null
      }));
    }
    
    // Batch counts
    const ids = initialFormulations.map(f => f.id);
    const { data: batchData } = await supabase
      .from('batches')
      .select('formulation_id')
      .in('formulation_id', ids);
      
    const counts = {};
    (batchData || []).forEach(b => {
      counts[b.formulation_id] = (counts[b.formulation_id] || 0) + 1;
    });
    
    initialFormulations = initialFormulations.map(f => ({
      ...f,
      batchCount: counts[f.id] || 0
    }));
  }

  // 2. Fetch inventory items
  const { data: initialItems } = await supabase
    .from('inventory_items')
    .select('id, name, unit')
    .order('name');

  // 3. Fetch pending edit requests (we can just query the edit_requests table directly since we are on the server)
  const { data: editReqs } = await supabase
    .from('edit_requests')
    .select('record_id')
    .eq('table_name', 'formulations')
    .eq('status', 'pending');
    
  const initialPendingIds = (editReqs || []).map(r => r.record_id);

  return (
    <FormulationsClient 
      initialFormulations={initialFormulations} 
      initialItems={initialItems || []} 
      initialPendingIds={initialPendingIds}
    />
  );
}
