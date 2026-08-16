import { createClient } from '@/utils/supabase/server';
import { requireLabAccess } from '@/lib/research/access';
import IncubationClient from './IncubationClient';

export const metadata = { title: 'Incubation Hub | OXYBIO' };
export const dynamic = 'force-dynamic';

export default async function IncubationPage() {
  const supabase = createClient();
  const access = await requireLabAccess(supabase, 'view');
  if (access.error) return access.error; // standard access denier from our library

  // Initial SSR Data Fetch for 0ms load times
  // Exact same logic as the GET method in route.js but run Server-Side before render
  let query = supabase
    .from('sample_incubation_records')
    .select('*, employees!logged_by(full_name, initials), updater:employees!updated_by(full_name, initials), batches(batch_id, status), batch_flasks(flask_label), batch_flask_qc_samples(sample_id), samples(sample_label, source_type, source_label, log_hour, timepoint_label, flask_label)')
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: records, error } = await query;
  
  if (error) {
    console.error('Server-side incubation fetch error:', error);
  }

  const initialRecords = records || [];

  // LNB linking mapping
  const batchIds = [...new Set(initialRecords.map(r => r.batch_id).filter(Boolean))];
  const prepIds = [...new Set(initialRecords.map(r => r.cell_bank_preparation_id).filter(Boolean))];
  const readingIds = [...new Set(initialRecords.map(r => r.fermentation_reading_id).filter(Boolean))];
  const lnbByBatch = {};
  const lnbByPrep = {};
  const readingById = {};

  if (readingIds.length > 0) {
    const { data: readings } = await supabase
      .from('batch_fermentation_readings')
      .select('id, elapsed_hours, logged_at, ph, optical_density')
      .in('id', readingIds);

    (readings || []).forEach(reading => {
      readingById[reading.id] = reading;
    });
  }

  if (batchIds.length > 0 || prepIds.length > 0) {
    let lnbQuery = supabase
      .from('lab_notebook_entries')
      .select('id, batch_id, cell_bank_preparation_id')
      .neq('status', 'Countersigned');

    if (batchIds.length > 0 && prepIds.length > 0) {
      lnbQuery = lnbQuery.or(`batch_id.in.(${batchIds.join(',')}),cell_bank_preparation_id.in.(${prepIds.join(',')})`);
    } else if (batchIds.length > 0) {
      lnbQuery = lnbQuery.in('batch_id', batchIds);
    } else {
      lnbQuery = lnbQuery.in('cell_bank_preparation_id', prepIds);
    }

    const { data: lnbs } = await lnbQuery.order('created_at', { ascending: false });
    (lnbs || []).forEach(entry => {
      if (entry.batch_id && !lnbByBatch[entry.batch_id]) lnbByBatch[entry.batch_id] = entry.id;
      if (entry.cell_bank_preparation_id && !lnbByPrep[entry.cell_bank_preparation_id]) lnbByPrep[entry.cell_bank_preparation_id] = entry.id;
    });
  }

  const enhancedRecords = initialRecords.map(record => ({
    ...record,
    fermentation_reading: readingById[record.fermentation_reading_id] || null,
    linked_lnb_id: lnbByBatch[record.batch_id] || lnbByPrep[record.cell_bank_preparation_id] || null,
  }));

  return (
    <div className="pb-24 pt-4 md:py-8 min-h-[100dvh] bg-slate-50">
      <IncubationClient initialRecords={enhancedRecords} />
    </div>
  );
}
