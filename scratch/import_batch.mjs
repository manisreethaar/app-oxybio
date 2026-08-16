import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import xlsx from 'xlsx';

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
const defaultUser = userMapping['LC']; // Default to LC if not found

const filePath = process.argv[2] || 'e:\\OXYBIO\\OB-FER-26-001_new_format (1).xlsx';
const isDryRun = false;

function findHeaderRow(data, headerStartText) {
  for (let i = 0; i < data.length; i++) {
    if (data[i] && typeof data[i][0] === 'string' && data[i][0].startsWith(headerStartText)) {
      return i;
    }
  }
  return -1;
}

function parseExcelDate(dateStr) {
  if (!dateStr || dateStr === '—' || dateStr === 'NA') return null;
  try {
    const parts = dateStr.toString().split(' ');
    const dmy = parts[0].split('-');
    if (dmy.length === 3) {
      const isoStr = `${dmy[2]}-${dmy[1]}-${dmy[0]}T${parts[1] || '00:00'}:00.000Z`;
      return new Date(isoStr).toISOString();
    }
  } catch(e) {}
  return null;
}

async function run() {
  console.log(`Starting Batch Import. Dry Run: ${isDryRun}`);
  const workbook = xlsx.readFile(filePath);

  // 1. Create Batch (01 BATCH INFO)
  const infoSheet = workbook.Sheets['01 BATCH INFO'];
  const infoData = xlsx.utils.sheet_to_json(infoSheet, { header: 1 });
  const batchIdRef = infoData[3][1];
  const dateStarted = parseExcelDate(infoData[4][3]);
  const numFlasks = infoData[5][3];

  let batchUuid = isDryRun ? 'mock-batch-uuid' : null;

  const batchPayload = {
    batch_id: batchIdRef,
    start_time: dateStarted,
    status: 'released',
    created_by: userMapping[infoData[5][1]] || defaultUser,
    experiment_type: 'Fermentation',
    product_name: infoData[4][1],
    num_flasks: numFlasks,
    current_stage: 'harvest'
  };

  if (!isDryRun) {
    const { data: existingBatch } = await supabase.from('batches').select('id').eq('batch_id', batchIdRef).maybeSingle();
    if (existingBatch) {
      batchUuid = existingBatch.id;
      console.log(`Found existing Batch: ${batchUuid}`);
      await supabase.from('batches').update({status: 'released', current_stage: 'harvest', num_flasks: numFlasks}).eq('id', batchUuid);
    } else {
      const { data, error } = await supabase.from('batches').insert([batchPayload]).select('id').single();
      if (error) throw new Error(`Batch insert failed: ${error.message}`);
      batchUuid = data.id;
      console.log(`Batch created: ${batchUuid}`);
    }
  } else {
    console.log('[DRY RUN] Would insert Batch:', batchPayload);
  }

  // 2. Parse Flasks (08_BATCH INOCULATION)
  const inocSheet = workbook.Sheets['08_BATCH INOCULATION'];
  const inocData = xlsx.utils.sheet_to_json(inocSheet, { header: 1 });
  const inocHeader = findHeaderRow(inocData, 'S.No');
  
  const flasksPayload = [];
  const flaskMap = {}; 
  
  if (inocHeader !== -1) {
    for (let i = inocHeader + 1; i < inocData.length; i++) {
      const row = inocData[i];
      if (!row || typeof row[0] !== 'number') break; // stop at empty S.No or non-number
      
      const flaskLabel = row[1];
      flasksPayload.push({
        batch_id: batchUuid,
        flask_label: flaskLabel,
        flask_full_id: `${batchIdRef}-${flaskLabel}`,
        status: 'active',
        current_stage: 'harvest',
        created_by: userMapping[row[11]] || defaultUser
      });
    }
  }

  if (!isDryRun) {
    const { data, error } = await supabase.from('batch_flasks').insert(flasksPayload).select('id, flask_label');
    if (error) throw new Error(`Flasks insert failed: ${error.message}`);
    data.forEach(f => flaskMap[f.flask_label] = f.id);
    console.log(`Flasks created: ${data.length}`);
  } else {
    console.log(`\n[DRY RUN] Would insert ${flasksPayload.length} Flasks. First:`, flasksPayload[0]);
    flasksPayload.forEach((f, i) => flaskMap[f.flask_label] = `mock-flask-${i+1}`);
  }

  // 3. Inventory Deductions (04_BATCH MEDIA PREP)
  const { data: invItems, error: invErr } = await supabase.from('inventory_items').select('id, name');
  const { data: invStock, error: stErr } = await supabase.from('inventory_stock').select('id, item_id, quantity').gt('quantity', 0);
  
  const mediaSheet = workbook.Sheets['04_BATCH MEDIA PREP'];
  const mediaData = xlsx.utils.sheet_to_json(mediaSheet, { header: 1 });
  const subHeader = findHeaderRow(mediaData, 'Substrate');
  
  if (subHeader !== -1) {
    const deductions = [];
    console.log(`\n[DRY RUN] Media Deductions:`);
    for (let i = subHeader + 1; i < mediaData.length; i++) {
      const row = mediaData[i];
      if (!row || !row[0]) break; // stop at empty row
      const ingredient = row[0];
      const qtyReq = row[2]; // Actual Qty (g)
      
      if (typeof qtyReq === 'number') {
         // rough match
         const matchedItem = invItems?.find(item => ingredient.toLowerCase().includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(ingredient.split(' ')[0].toLowerCase()));
         if (matchedItem) {
            const stock = invStock?.find(s => s.item_id === matchedItem.id);
            if (stock) {
               deductions.push({
                  stock_id: stock.id,
                  quantity: qtyReq * flasksPayload.length, // total qty
                  movement_type: 'Usage',
                  reference_id: batchUuid,
                  issued_by: defaultUser,
                  notes: `Used in Batch ${batchIdRef}`
               });
               console.log(`- Matched ${ingredient} to item_id ${matchedItem.id}. Will deduct ${qtyReq * flasksPayload.length} from stock ${stock.id}`);
            } else {
               console.log(`- Matched ${ingredient} but NO STOCK available!`);
            }
         } else {
            console.log(`- Could not auto-match ingredient: ${ingredient}`);
         }
      }
    }
    
    if (!isDryRun && deductions.length > 0) {
      // Create inventory movements
      for (const ded of deductions) {
         await supabase.from('inventory_movements').insert([ded]);
         // Optionally update stock table if trigger doesn't do it
         // const stock = invStock.find(s => s.id === ded.stock_id);
         // await supabase.from('inventory_stock').update({quantity: stock.quantity - ded.quantity}).eq('id', ded.stock_id);
      }
      console.log(`Deducted ${deductions.length} inventory items.`);
    }
  }

  // 4. Batch Growth Log (09_BATCH GROWTH LOG)
  const logSheet = workbook.Sheets['09_BATCH GROWTH LOG'];
  const logData = xlsx.utils.sheet_to_json(logSheet, { header: 1 });
  const logHeader = findHeaderRow(logData, 'S.No');
  
  const readingsPayload = [];
  if (logHeader !== -1) {
    for (let i = logHeader + 1; i < logData.length; i++) {
      const row = logData[i];
      if (!row || typeof row[0] !== 'number') break; 
      const flaskLabel = row[1];
      const dateStr = `${row[3]} ${row[4]}`;
      
      readingsPayload.push({
        batch_id: batchUuid,
        flask_id: flaskMap[flaskLabel] || null,
        flask_label: flaskLabel,
        elapsed_hours: row[2],
        logged_at: parseExcelDate(dateStr),
        ph: row[5] === 'NA' ? null : row[5],
        optical_density: row[6] === 'NA' ? null : row[6],
        logged_by: userMapping[row[10]] || defaultUser,
        notes: row[9] === 'NA' ? null : row[9]
      });
    }
  }

  if (!isDryRun && readingsPayload.length > 0) {
    const { error } = await supabase.from('batch_fermentation_readings').insert(readingsPayload);
    if (error) console.error(`Readings insert failed: ${error.message}`);
    else console.log(`Readings created: ${readingsPayload.length}`);
  } else if (isDryRun) {
    console.log(`\n[DRY RUN] Would insert ${readingsPayload.length} Growth Readings. First:`, readingsPayload[0]);
  }
  
  // 5. Harvest (12_HARVEST)
  const harvestSheet = workbook.Sheets['12_HARVEST'];
  const harvestData = xlsx.utils.sheet_to_json(harvestSheet, { header: 1 });
  const harvestHeader = findHeaderRow(harvestData, 'S.No');
  
  const harvestPayload = [];
  if (harvestHeader !== -1) {
    let totalVolL = 0;
    let finalPh = null;
    let finalOd = null;
    let operator = null;
    let hDate = null;
    for (let i = harvestHeader + 1; i < harvestData.length; i++) {
      const row = harvestData[i];
      if (!row || typeof row[0] !== 'number') break;
      hDate = hDate || parseExcelDate(row[3]);
      operator = operator || userMapping[row[9]] || defaultUser;
      if (row[4] !== 'NA') finalPh = row[4];
      if (row[5] !== 'NA') finalOd = row[5];
      if (row[7] !== 'NA') totalVolL += (row[7] / 1000.0);
    }
    if (hDate) {
      harvestPayload.push({
        batch_id: batchUuid,
        harvest_start: hDate,
        final_culture_vol_l: totalVolL,
        operator_id: operator,
        notes: `Final pH: ${finalPh}, Final OD: ${finalOd}`
      });
    }
  }

  if (!isDryRun && harvestPayload.length > 0) {
     const {error} = await supabase.from('batch_stage_harvest').insert(harvestPayload);
     if (error) console.error(`Harvest insert failed: ${error.message}`);
  } else if (isDryRun) {
     console.log(`\n[DRY RUN] Would insert ${harvestPayload.length} Harvest Records. First:`, harvestPayload[0]);
  }

  console.log('\nDry Run Complete.');
}

run().catch(console.error);
