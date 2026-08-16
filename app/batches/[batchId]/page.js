import { createAdminClient } from '@/utils/supabase/admin';
import { redirect } from 'next/navigation';
import BatchDetailsClient from './BatchDetailsClient';

// Server Component — runs on the server, fetches all data in one call.
// The browser never has to wait for client-side fetches on first render.
export default async function BatchDetailsPage({ params: { batchId } }) {
  const supabase = createAdminClient();

  // All data fetched in parallel, server-side — fastest possible load
  const [
    batchRes,
    flasksRes,
    transRes,
    empRes,
    stockRes,
    lnbRes,
    epRes,
    seedTrainsRes,
    formsRes,
    vialsRes,
    stdCurveRes,
    sopsRes,
  ] = await Promise.all([
    supabase
      .from('batches')
      .select('*, formulations(id, name, code, version, ingredients, base_volume_ml)')
      .eq('id', batchId)
      .single(),
    supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label').limit(100),
    supabase
      .from('stage_transitions')
      .select('*, employees!stage_transitions_changed_by_fkey(full_name)')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name').limit(500),
    supabase
      .from('inventory_stock')
      .select('*, inventory_items(name, unit, category)')
      .gt('current_quantity', 0)
      .eq('status', 'Available')
      .limit(2000),
    supabase.from('lab_notebook_entries').select('id, flask_id').eq('batch_id', batchId).limit(500),
    supabase.from('batch_flask_endpoints').select('total_hours, flask_id').eq('batch_id', batchId).limit(100),
    supabase.from('batch_seed_trains').select('*').eq('batch_id', batchId).order('created_at', { ascending: true }),
    supabase.from('formulations').select('id, name, version').is('archived_at', null).order('name').limit(200),
    supabase.from('cell_bank_vials').select('id, vial_label').order('vial_label').limit(500),
    supabase.from('standard_curves').select('*').eq('is_active', true).eq('test_type', 'anthrone').maybeSingle(),
    supabase.from('sop_library').select('id, title, sop_id').eq('is_active', true).order('title').limit(200),
  ]);

  if (batchRes.error || !batchRes.data) {
    redirect('/batches');
  }

  const batch = batchRes.data;
  const seedTrains = seedTrainsRes.data || [];

  // Fetch fermentation readings for all seed trains + flasks
  const flasks = flasksRes.data || [];
  let fermentationReadings = [];
  const flaskIds = flasks.map(x => x.id);
  const seedIds = seedTrains.map(s => s.id);

  if (seedIds.length > 0 || flaskIds.length > 0) {
    let query = supabase
      .from('batch_fermentation_readings')
      .select('*')
      .order('logged_at', { ascending: true })
      .limit(2000);

    const filters = [];
    if (seedIds.length > 0) filters.push(`seed_train_id.in.(${seedIds.join(',')})`);
    if (flaskIds.length > 0) filters.push(`flask_id.in.(${flaskIds.join(',')})`);
    if (filters.length > 0) query = query.or(filters.join(','));

    const { data: frData } = await query;
    fermentationReadings = frData || [];
  }

  const initialData = {
    batch,
    flasks,
    transitions: transRes.data || [],
    employees: empRes.data || [],
    availableStock: stockRes.data || [],
    lnbEntries: lnbRes.data || [],
    flaskEndpoints: epRes.data || [],
    seedTrains,
    fermentationReadings,
    formulations: formsRes.data || [],
    vials: vialsRes.data || [],
    standardCurve: stdCurveRes.data || null,
    sops: sopsRes.data || [],
  };

  return <BatchDetailsClient batchId={batchId} initialData={initialData} />;
}
