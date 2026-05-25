// Silently syncs batch stage data into the linked lab notebook entry's
// stage_snapshots JSONB column. Always fire-and-forget — never throws.
//
// flaskLabel: pass the flask label (e.g. "F1") for per-flask stages
// (inoculation, fermentation, qc), or null for batch-level stages.
export async function syncStageToLNB(supabase, batchId, stage, snapshot, flaskLabel = null) {
  if (!batchId || !stage) return;
  try {
    const { data: entry } = await supabase
      .from('lab_notebook_entries')
      .select('id, stage_snapshots')
      .eq('batch_id', batchId)
      .neq('status', 'Countersigned')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!entry) return;

    const existing = entry.stage_snapshots || {};
    const timestamped = { ...snapshot, synced_at: new Date().toISOString() };

    const stageData = flaskLabel
      ? { ...(existing[stage] || {}), [flaskLabel]: timestamped }
      : timestamped;

    await supabase
      .from('lab_notebook_entries')
      .update({
        stage_snapshots: { ...existing, [stage]: stageData },
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id);
  } catch { /* silent — never block the UI */ }
}
