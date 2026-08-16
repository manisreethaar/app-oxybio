/**
 * fix_seed_trains.mjs
 * 
 * For each imported OB-FER-26 batch:
 * 1. Creates a batch_seed_trains row for 'seed_1' (completed) and 'production' (completed)
 * 2. Links existing batch_flasks to the production seed_train
 * 3. Links existing batch_fermentation_readings to the production seed_train
 * 4. Links inoculation data into the seed_train row
 */

import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userMapping = {
  'SK': '19c5a607-a003-456a-a9b4-551925daad80',
  'MS': '2e14d5dd-b502-4f6b-8fa8-5519a681470a',
  'AS': 'b495c4c9-cd83-4558-9886-5ba34902a1e0',
  'LC': '6809c63b-ebf2-4908-894e-709c0f9322ca',
  'DM': '1a6cf92b-bd6e-4c26-9e9b-acbca9d19add'
};
const defaultUser = userMapping['LC'];

function parseExcelDate(dateVal) {
  if (!dateVal) return null;
  try {
    if (typeof dateVal === 'number') {
      const d = new Date((dateVal - 25569) * 86400 * 1000);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }
    if (typeof dateVal === 'string') {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }
  } catch { return null; }
  return null;
}

function findHeaderRow(data, text) {
  for (let i = 0; i < data.length; i++) {
    if (data[i] && typeof data[i][0] === 'string' && data[i][0].includes(text)) return i;
  }
  return -1;
}

async function processFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const infoSheet = workbook.Sheets['01 BATCH INFO'];
  if (!infoSheet) return;
  const infoData = xlsx.utils.sheet_to_json(infoSheet, { header: 1 });
  const batchIdRef = infoData[3]?.[1];
  if (!batchIdRef) return;

  console.log(`\n=== Processing ${batchIdRef} ===`);

  // 1. Find the batch
  const { data: batch } = await supabase
    .from('batches')
    .select('id, batch_id, start_time, created_by')
    .eq('batch_id', batchIdRef)
    .maybeSingle();

  if (!batch) {
    console.log(`  SKIP: batch not found in DB`);
    return;
  }

  // 2. Check if seed_trains already exist (avoid duplicates)
  const { data: existing } = await supabase
    .from('batch_seed_trains')
    .select('id, stage_type')
    .eq('batch_id', batch.id);

  if (existing && existing.length > 0) {
    console.log(`  INFO: seed_trains already exist (${existing.map(s => s.stage_type).join(', ')}), skipping creation`);
    // Still try to link readings
    const prodTrain = existing.find(s => s.stage_type === 'production');
    if (prodTrain) {
      await linkReadingsAndFlasks(batch.id, prodTrain.id);
    }
    return;
  }

  // 3. Read inoculation data from Excel to get inoculation time
  const inocSheet = workbook.Sheets['08_BATCH INOCULATION'];
  let inoculatedAt = batch.start_time;
  let inoculatedBy = batch.created_by || defaultUser;
  let strainSource = null;

  if (inocSheet) {
    const inocData = xlsx.utils.sheet_to_json(inocSheet, { header: 1 });
    const inocHeader = findHeaderRow(inocData, 'S.No');
    if (inocHeader !== -1) {
      const firstRow = inocData[inocHeader + 1];
      if (firstRow) {
        const rawTime = firstRow[7]; // inoculation time column
        const parsed = parseExcelDate(rawTime);
        if (parsed) inoculatedAt = parsed;
        strainSource = firstRow[5]; // strain column
        inoculatedBy = userMapping[firstRow[10]] || inoculatedBy;
      }
    }
  }

  // 4. Read harvest/end date from HARVEST sheet
  const harvestSheet = workbook.Sheets['12_HARVEST'];
  let harvestEndTime = null;
  if (harvestSheet) {
    const harvestData = xlsx.utils.sheet_to_json(harvestSheet, { header: 1 });
    const harvestHeader = findHeaderRow(harvestData, 'S.No');
    if (harvestHeader !== -1) {
      const row = harvestData[harvestHeader + 1];
      if (row) harvestEndTime = parseExcelDate(row[3]);
    }
  }

  // 5. Create seed_1 stage (represents seed preparation before inoculation - mark completed)
  const { data: seed1, error: s1Err } = await supabase
    .from('batch_seed_trains')
    .insert({
      batch_id: batch.id,
      stage_type: 'seed_1',
      status: 'completed',
      inoculum_source_type: strainSource ? 'other' : 'glycerol',
      inoculum_source_details: strainSource || null,
      inoculated_at: batch.start_time,
      inoculated_by: inoculatedBy,
    })
    .select('id')
    .single();

  if (s1Err) {
    console.log(`  ERROR creating seed_1:`, s1Err.message);
    return;
  }
  console.log(`  Created seed_1 train: ${seed1.id}`);

  // 6. Create production stage (the main fermentation - mark completed)
  const { data: prodTrain, error: prodErr } = await supabase
    .from('batch_seed_trains')
    .insert({
      batch_id: batch.id,
      stage_type: 'production',
      status: 'completed',
      inoculated_at: inoculatedAt,
      inoculated_by: inoculatedBy,
    })
    .select('id')
    .single();

  if (prodErr) {
    console.log(`  ERROR creating production:`, prodErr.message);
    return;
  }
  console.log(`  Created production train: ${prodTrain.id}`);

  // 7. Link all fermentation readings and flasks to the production train
  await linkReadingsAndFlasks(batch.id, prodTrain.id);
}

async function linkReadingsAndFlasks(batchId, prodTrainId) {
  // Link all fermentation readings to production seed_train
  const { error: rErr, count: rCount } = await supabase
    .from('batch_fermentation_readings')
    .update({ seed_train_id: prodTrainId })
    .eq('batch_id', batchId)
    .is('seed_train_id', null);

  if (rErr) console.log(`  ERROR linking readings:`, rErr.message);
  else console.log(`  Linked fermentation readings to production train`);

  // Link flasks to production seed_train (batch_flasks has seed_train_id column)
  const { data: flaskCols } = await supabase
    .from('batch_flasks')
    .select('id')
    .eq('batch_id', batchId)
    .limit(1);

  if (flaskCols && flaskCols.length > 0) {
    // Check if batch_flasks has seed_train_id
    const testFlask = flaskCols[0];
    const { data: fullFlask } = await supabase
      .from('batch_flasks')
      .select('id, seed_train_id')
      .eq('id', testFlask.id)
      .maybeSingle();

    if ('seed_train_id' in (fullFlask || {})) {
      const { error: fErr } = await supabase
        .from('batch_flasks')
        .update({ seed_train_id: prodTrainId })
        .eq('batch_id', batchId)
        .is('seed_train_id', null);
      if (fErr) console.log(`  ERROR linking flasks:`, fErr.message);
      else console.log(`  Linked flasks to production train`);
    } else {
      console.log(`  NOTE: batch_flasks has no seed_train_id column, skipping flask link`);
    }
  }
}

async function run() {
  const dir = 'e:\\OXYBIO';
  const files = fs.readdirSync(dir).filter(f => f.match(/OB-FER-26-0\d+.*\.xlsx$/));
  console.log(`Found ${files.length} batch Excel files`);
  for (const f of files) {
    await processFile(path.join(dir, f));
  }
  console.log('\nDone!');
}

run().catch(console.error);
