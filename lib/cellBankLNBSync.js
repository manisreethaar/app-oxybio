// Fire-and-forget: sync a cell bank step into a dedicated LNB entry.
// Creates the entry on first call, then merges step data into stage_snapshots.
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
