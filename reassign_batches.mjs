import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reassignBatches() {
  const yy = '26';
  const prefix = `OB-FER-${yy}-`;

  const { data: batches, error: fetchError } = await supabaseAdmin
    .from('batches')
    .select('id, batch_id, created_at')
    .like('batch_id', `${prefix}%`)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error("Error fetching batches:", fetchError);
    return;
  }

  // Filter out the first one (001) which is already released/started
  const batchesToUpdate = batches.filter(b => b.batch_id !== `${prefix}001`);
  
  console.log(`Found ${batchesToUpdate.length} batches to update.`);

  // First, set them all to a temp ID to avoid unique constraint violations
  for (let i = 0; i < batchesToUpdate.length; i++) {
    const batch = batchesToUpdate[i];
    const tempId = `TEMP-${prefix}${i + 2}`;
    console.log(`Setting ${batch.batch_id} to ${tempId}`);
    await supabaseAdmin.from('batches').update({ batch_id: tempId }).eq('id', batch.id);
  }

  // Now assign sequentially starting from 2
  for (let i = 0; i < batchesToUpdate.length; i++) {
    const batch = batchesToUpdate[i];
    const oldBatchId = batch.batch_id;
    const newSeq = String(i + 2).padStart(3, '0');
    const newBatchId = `${prefix}${newSeq}`;
    
    console.log(`Updating batch ${batch.id} from ${oldBatchId} to ${newBatchId}`);

    const { error: batchErr } = await supabaseAdmin
      .from('batches')
      .update({ batch_id: newBatchId })
      .eq('id', batch.id);
    
    if (batchErr) {
      console.error(`Failed to update batch ${batch.id}:`, batchErr);
      continue;
    }

    const { data: flasks } = await supabaseAdmin.from('batch_flasks').select('id, flask_label').eq('batch_id', batch.id);
    for (const flask of flasks || []) {
      const newFlaskId = `${newBatchId}-${flask.flask_label}`;
      await supabaseAdmin.from('batch_flasks').update({ flask_full_id: newFlaskId }).eq('id', flask.id);
    }

    const { data: tasks } = await supabaseAdmin.from('tasks').select('id, title, description').eq('batch_id', batch.id);
    for (const task of tasks || []) {
      const newTitle = task.title.replace(oldBatchId, newBatchId);
      const newDesc = task.description ? task.description.replace(oldBatchId, newBatchId) : null;
      await supabaseAdmin.from('tasks').update({ title: newTitle, description: newDesc }).eq('id', task.id);
    }

    const { data: notebooks } = await supabaseAdmin.from('lab_notebook_entries').select('id, title').eq('batch_id', batch.id);
    for (const nb of notebooks || []) {
      const newTitle = nb.title.replace(oldBatchId, newBatchId);
      await supabaseAdmin.from('lab_notebook_entries').update({ title: newTitle }).eq('id', nb.id);
    }
    
    const { data: movements } = await supabaseAdmin.from('inventory_movements').select('id, batch_reference').eq('batch_reference', oldBatchId);
    for (const mov of movements || []) {
      await supabaseAdmin.from('inventory_movements').update({ batch_reference: newBatchId }).eq('id', mov.id);
    }

    console.log(`Successfully updated batch to ${newBatchId}`);
  }

  console.log("Done.");
}

reassignBatches();
