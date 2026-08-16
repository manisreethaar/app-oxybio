import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
      const unixTimestamp = (dateVal - 25569) * 86400 * 1000;
      return new Date(unixTimestamp).toISOString();
    }
    if (typeof dateVal === 'string') {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }
  } catch (e) {
    return null;
  }
  return null;
}

function findHeaderRow(data, headerStartText) {
  for (let i = 0; i < data.length; i++) {
    if (data[i] && typeof data[i][0] === 'string' && data[i][0].includes(headerStartText)) {
      return i;
    }
  }
  return -1;
}

const isDryRun = false;

async function processFile(filePath) {
  console.log(`\nProcessing file: ${path.basename(filePath)}`);
  const workbook = xlsx.readFile(filePath);
  
  const infoSheet = workbook.Sheets['01 BATCH INFO'];
  if (!infoSheet) return;
  const infoData = xlsx.utils.sheet_to_json(infoSheet, { header: 1 });
  const batchIdRef = infoData[3][1];
  const refSOP = infoData[3][3];
  
  // Find batch in DB
  const { data: existingBatch, error: err } = await supabase.from('batches').select('id, protocol_sop_id').eq('batch_id', batchIdRef).maybeSingle();
  if (err || !existingBatch) {
      console.log(`- Batch ${batchIdRef} not found in DB. Run import_batch.mjs first!`);
      return;
  }
  const batchUuid = existingBatch.id;

  // Pre-fetch flasks for this batch to get their UUIDs
  const { data: existingFlasks } = await supabase.from('batch_flasks').select('id, flask_label').eq('batch_id', batchUuid);
  const flaskMap = {};
  if (existingFlasks) existingFlasks.forEach(f => flaskMap[f.flask_label] = f.id);

  // --- MODULE 5: SOP Lookup ---
  if (refSOP && typeof refSOP === 'string' && refSOP !== 'NA') {
      const { data: sopMatches } = await supabase.from('sops').select('id, code, title').ilike('code', `%${refSOP}%`).limit(1);
      if (sopMatches && sopMatches.length > 0) {
          const sopId = sopMatches[0].id;
          if (!isDryRun) {
             await supabase.from('batches').update({ protocol_sop_id: sopId }).eq('id', batchUuid);
          }
          console.log(`- [SOP] Matched "${refSOP}" to SOP ID ${sopId}`);
      } else {
          console.log(`- [SOP] No match found for "${refSOP}"`);
      }
  }

  // --- MODULE 1: Inoculation (08_BATCH INOCULATION) ---
  const inocSheet = workbook.Sheets['08_BATCH INOCULATION'];
  if (inocSheet) {
    const inocData = xlsx.utils.sheet_to_json(inocSheet, { header: 1 });
    const inocHeader = findHeaderRow(inocData, 'S.No');
    const inocPayload = [];
    if (inocHeader !== -1) {
      for (let i = inocHeader + 1; i < inocData.length; i++) {
        const row = inocData[i];
        if (!row || typeof row[0] !== 'number') break;
        
        const flaskLabel = row[1];
        const inocVol = row[4];
        const strain = row[5];
        const time = row[7];
        const notes = row[9];
        const op = row[10];

        inocPayload.push({
          batch_id: batchUuid,
          flask_id: flaskMap[flaskLabel] || null,
          inoculum_vol_ml: inocVol !== 'NA' ? parseFloat(inocVol) : null,
          inoculum_source: strain !== 'NA' ? strain : null,
          t_zero_time: time !== 'NA' ? parseExcelDate(time) : null,
          contamination_notes: notes !== 'NA' ? notes : null,
          operator_id: userMapping[op] || defaultUser
        });
      }
      if (inocPayload.length > 0) {
          if (!isDryRun) {
             const {error} = await supabase.from('batch_flask_inoculations').insert(inocPayload);
             if (error) console.error(`- [INOCULATION] Error:`, error.message);
             else console.log(`- [INOCULATION] Inserted ${inocPayload.length} records.`);
          } else {
             console.log(`- [INOCULATION] Would insert ${inocPayload.length} records.`);
          }
      }
    }
  }

  // --- MODULE 2: Downstream (13_DOWNSTREAM) ---
  const dsSheet = workbook.Sheets['13_DOWNSTREAM'];
  if (dsSheet) {
      const dsData = xlsx.utils.sheet_to_json(dsSheet, { header: 1 });
      const dsHeader = findHeaderRow(dsData, 'S.No');
      if (dsHeader !== -1) {
         let steps = [];
         let finalWeight = null;
         let operator = null;
         for (let i = dsHeader + 1; i < dsData.length; i++) {
            const row = dsData[i];
            if (!row || typeof row[0] !== 'number') break;
            steps.push({
               step: row[1],
               time_hrs: row[2],
               temp_c: row[3],
               speed_pressure: row[4],
               output: row[5],
               remarks: row[6]
            });
            operator = operator || userMapping[row[7]] || defaultUser;
            if (row[5] !== 'NA' && row[5]) finalWeight = parseFloat(row[5]);
         }
         if (steps.length > 0) {
             const payload = {
                 batch_id: batchUuid,
                 steps: steps,
                 final_weight_kg: finalWeight,
                 operator_id: operator
             };
             if (!isDryRun) {
                 const {error} = await supabase.from('batch_stage_downstream').insert([payload]);
                 if (error) console.error(`- [DOWNSTREAM] Error:`, error.message);
                 else console.log(`- [DOWNSTREAM] Inserted 1 record.`);
             } else {
                 console.log(`- [DOWNSTREAM] Would insert 1 record with ${steps.length} steps.`);
             }
         }
      }
  }

  // --- MODULE 4: Deviations (20_DEVIATIONS) ---
  const devSheet = workbook.Sheets['20_DEVIATIONS'];
  if (devSheet) {
      const devData = xlsx.utils.sheet_to_json(devSheet, { header: 1 });
      const devHeader = findHeaderRow(devData, 'S.No');
      if (devHeader !== -1) {
          const devPayload = [];
          for (let i = devHeader + 1; i < devData.length; i++) {
              const row = devData[i];
              if (!row || typeof row[0] !== 'number') break;
              devPayload.push({
                  batch_id: batchUuid,
                  title: `Deviation in ${batchIdRef}`,
                  description: (row[2] && row[2] !== 'NA') ? row[2] : 'Unknown Deviation',
                  severity: 'Medium',
                  source: 'Fermentation',
                  status: 'Open',
                  reported_by: userMapping[row[6]] || defaultUser
              });
          }
          if (devPayload.length > 0) {
              if (!isDryRun) {
                 const {error} = await supabase.from('deviations').insert(devPayload);
                 if (error) console.error(`- [DEVIATIONS] Error:`, error.message);
                 else console.log(`- [DEVIATIONS] Inserted ${devPayload.length} records.`);
              } else {
                 console.log(`- [DEVIATIONS] Would insert ${devPayload.length} records.`);
              }
          }
      }
  }

  // --- MODULE 3: Analytics & QC (11_ASSAY, 15_PLATING, 17_MICROSCOPY) ---
  // Create helper to process a QC sheet
  async function processQCSheet(sheetName, testType) {
      const qcSheet = workbook.Sheets[sheetName];
      if (!qcSheet) return;
      const data = xlsx.utils.sheet_to_json(qcSheet, { header: 1 });
      const headerRow = findHeaderRow(data, 'S.No');
      if (headerRow === -1) return;
      
      const testResultsPayload = [];
      for (let i = headerRow + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || typeof row[0] !== 'number') break;
          
          const flaskLabel = row[1];
          const valCol = row[3]; // Varies by sheet, but usually result is around col 3 or 4.
          const opCol = userMapping[row[7]] || defaultUser;
          
          if (valCol !== 'NA' && valCol) {
             // 1. Create Sample
             const sampleLabel = `${batchIdRef}-${flaskLabel}-${sheetName.substring(0, 5)}`;
             let sampleId = `mock-sample-${i}`;
             if (!isDryRun) {
                 const { data: sData, error: sErr } = await supabase.from('samples').insert([{
                     source_type: 'batch',
                     source_id: batchUuid,
                     flask_id: flaskMap[flaskLabel] || null,
                     flask_label: flaskLabel,
                     sample_label: sampleLabel,
                     collected_by: opCol
                 }]).select('id').single();
                 if (!sErr && sData) sampleId = sData.id;
             }
             
             let finalTestType = 'custom';
             let detailPayload = {};
             if (testType === 'Plating') {
                finalTestType = 'plate_analysis';
             } else if (testType === 'Microscopy') {
                finalTestType = 'custom';
                detailPayload = { custom_type: 'Microscopy' };
             } else if (testType === 'Assay') {
                finalTestType = 'custom';
                detailPayload = { custom_type: 'Assay' };
             }

             // 2. Create Test Result
             testResultsPayload.push({
                 sample_id: sampleId,
                 test_type: finalTestType,
                 detail: detailPayload,
                 text_value: String(valCol),
                 entered_by: opCol
             });
          }
      }
      if (testResultsPayload.length > 0) {
          if (!isDryRun) {
             const {error} = await supabase.from('test_results').insert(testResultsPayload);
             if (error) console.error(`- [QC ${testType}] Error:`, error.message);
             else console.log(`- [QC ${testType}] Inserted ${testResultsPayload.length} records.`);
          } else {
             console.log(`- [QC ${testType}] Would insert ${testResultsPayload.length} samples/results.`);
          }
      }
  }

  await processQCSheet('11_ASSAY RESULTS', 'Assay');
  await processQCSheet('15_PLATING', 'Plating');
  await processQCSheet('17_MICROSCOPY', 'Microscopy');
}

async function run() {
  const dir = 'e:\\OXYBIO';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('OB-FER-26-00') && f.endsWith('.xlsx'));
  for (const f of files) {
      await processFile(path.join(dir, f));
  }
}

run().catch(console.error);
