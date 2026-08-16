import { createClient } from '@/utils/supabase/server';
import BatchesClient from './BatchesClient';
import { cookies } from 'next/headers';

export default async function BatchesPage() {
  const supabase = createClient(cookies());

  // 1. Fetch batches
  const [activeRes, completedRes, archivedRes] = await Promise.all([
    supabase
      .from('batches')
      .select(`
        id, batch_id, experiment_type, sku_target, status, current_stage,
        planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
        created_by,
        formulations(name, code, version),
        batch_flasks(id, flask_label, status, current_stage)
      `)
      .is('archived_at', null)
      .not('status', 'in', '("released","rejected")')
      .order('created_at', { ascending: false }),
    supabase
      .from('batches')
      .select(`
        id, batch_id, experiment_type, sku_target, status, current_stage,
        planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
        created_by,
        formulations(name, code, version),
        batch_flasks(id, flask_label, status, current_stage)
      `)
      .is('archived_at', null)
      .in('status', ['released', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('batches')
      .select(`
        id, batch_id, experiment_type, sku_target, status, current_stage,
        planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
        created_by,
        formulations(name, code, version),
        batch_flasks(id, flask_label, status, current_stage)
      `)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(30),
  ]);

  const allFetched = [...(activeRes.data || []), ...(completedRes.data || []), ...(archivedRes.data || [])];
  const creatorIds = Array.from(new Set(allFetched.map(b => b.created_by).filter(Boolean)));

  let creatorsMap = {};
  if (creatorIds.length > 0) {
    const { data: creatorData } = await supabase
      .from('employees')
      .select('id, full_name, initials')
      .in('id', creatorIds);
    (creatorData || []).forEach(c => { creatorsMap[c.id] = c; });
  }

  const attachCreator = b => ({ ...b, creator: creatorsMap[b.created_by] || null });

  const fetchedActive = (activeRes.data || []).map(attachCreator);
  const fetchedCompleted = (completedRes.data || []).map(attachCreator);
  const fetchedArchived = (archivedRes.data || []).map(attachCreator);

  let epMap = {};
  if (fetchedActive.length > 0) {
    const { data: epData } = await supabase
      .from('batch_flask_endpoints')
      .select('batch_id, total_hours, end_time')
      .in('batch_id', fetchedActive.map(b => b.id));
    (epData || []).forEach(ep => {
      const prev = epMap[ep.batch_id];
      const prevHrs = prev?.total_hours ?? null;
      const curHrs = ep.total_hours ?? null;
      if (curHrs != null && (prevHrs == null || curHrs > prevHrs)) {
        epMap[ep.batch_id] = { total_hours: curHrs, end_time: ep.end_time ?? null };
      } else if (!prev) {
        epMap[ep.batch_id] = { total_hours: null, end_time: ep.end_time ?? null };
      }
    });
  }

  // 2. Fetch Formulations
  const { data: formulations } = await supabase
    .from('formulations')
    .select('id, name, code, version, status')
    .ilike('status', 'approved')
    .is('archived_at', null)
    .order('name');

  // 3. Fetch Edit Requests
  const { data: editReqs } = await supabase
    .from('edit_requests')
    .select('record_id')
    .eq('status', 'pending');
    
  const initialPendingIds = (editReqs || []).map(r => r.record_id);

  return (
    <BatchesClient 
      initialActive={fetchedActive}
      initialCompleted={fetchedCompleted}
      initialArchived={fetchedArchived}
      initialEndpoints={epMap}
      initialFormulations={formulations || []}
      initialPendingIds={initialPendingIds}
    />
  );
}
