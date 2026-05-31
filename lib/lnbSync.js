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

// Fire-and-forget: sync a cell bank step into a dedicated LNB entry.
// Creates the entry on first call, then merges step data into stage_snapshots.
// (Previously in lib/cellBankLNBSync.js — merged here for consolidation.)
export async function syncCellBankStepToLNB(supabase, prepId, prepCode, stepKey, stepData, createdBy) {
  if (!prepId || !stepKey) return;
  try {
    const { data: existing } = await supabase
      .from('lab_notebook_entries')
      .select('id, stage_snapshots')
      .eq('cell_bank_preparation_id', prepId)
      .neq('status', 'Countersigned')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshots = {
      ...(existing?.stage_snapshots || {}),
      [stepKey]: { ...stepData, recorded_at: new Date().toISOString() },
    };

    if (existing) {
      await supabase
        .from('lab_notebook_entries')
        .update({ stage_snapshots: snapshots, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('lab_notebook_entries').insert({
        title: `Cell Bank — ${prepCode}`,
        batch_stage: 'cell_bank',
        cell_bank_preparation_id: prepId,
        stage_snapshots: snapshots,
        status: 'Draft',
        created_by: createdBy || null,
      });
    }
  } catch {
    // Silent — never throw from background sync
  }
}
