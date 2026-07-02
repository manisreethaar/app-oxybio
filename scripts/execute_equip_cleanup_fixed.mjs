import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const masterList = [
    { name: "Autoclave", status: "Operational", needsCal: false },
    { name: "Bio Chemical India – Fermentor (model: Bioage 2A)", status: "PARTIALLY FUNCTIONAL", needsCal: false },
    { name: "Scigenics – Fermentor", status: "NOT WORKING", needsCal: false },
    { name: "Kadavul Electric Mechanical Industries – Laminar Air Flow", status: "Operational", needsCal: false },
    { name: "Kemi – Laminar Air Flow", status: "Operational", needsCal: false },
    { name: "Tech Lab Instruments – Incubator", status: "Operational", needsCal: false },
    { name: "Technico – BOD Incubator", status: "Operational", needsCal: false },
    { name: "Hybridization Oven – Scigenics Biotech", status: "IN MAINTENANCE", needsCal: false },
    { name: "Plant Growth Chamber (Orbitek) – Scigenics Biotech", status: "Operational", needsCal: false },
    { name: "Bino CXI – Microscope", status: "Operational", needsCal: false },
    { name: "Remi – Clinical Centrifuge", status: "Operational", needsCal: false },
    { name: "Remi – Cooling Centrifuge (Model 412 LAG)", status: "Operational", needsCal: false },
    { name: "Remi – Micro Centrifuge (12C)", status: "Operational", needsCal: false },
    { name: "Remi – R-8C Centrifuge", status: "Operational", needsCal: false },
    { name: "Remi – Centrifuge (KA 6775)", status: "Operational", needsCal: false },
    { name: "Deen Instruments – Magnetic Stirrer", status: "Operational", needsCal: false },
    { name: "Remi – Cyclo Mixer", status: "Operational", needsCal: false },
    { name: "Orbital Shaker – Scigenics Biotech", status: "Operational", needsCal: false },
    { name: "Orbital Water Bath Shaker – Ind Labs", status: "Operational", needsCal: false },
    { name: "Rotary Shaker – Ind Labs", status: "Operational", needsCal: false },
    { name: "ITC Industrial and Laboratory – Refrigerator Water Bath", status: "Operational", needsCal: false },
    { name: "Rashmi – Water Bath", status: "Operational", needsCal: false },
    { name: "Oil Bath", status: "Operational", needsCal: false },
    { name: "Cyberlab – Electronic Weighing Machine (Max 600 g)", status: "Operational", needsCal: true },
    { name: "Electronic Scale", status: "Operational", needsCal: true },
    { name: "Weighing Machine (Electronic, Max 300 g)", status: "Operational", needsCal: true },
    { name: "Industrial & Laboratory Tools Corporation – Hot Air Oven", status: "Operational", needsCal: false },
    { name: "Precision Lab Furniture Industries – Hot Air Oven", status: "Operational", needsCal: false },
    { name: "Golden / Butterfly – Stove", status: "Operational", needsCal: false },
    { name: "Hot Plate", status: "Operational", needsCal: false },
    { name: "Microwave Oven – Samsung", status: "Operational", needsCal: false },
    { name: "LG – Refrigerator", status: "Operational", needsCal: false },
    { name: "LG – Refrigerator (Model GL 328)", status: "Operational", needsCal: false },
    { name: "Deep Freezer – Ins Lab", status: "Operational", needsCal: false },
    { name: "Rockwell – Deep Freezer", status: "Operational", needsCal: false },
    { name: "Rockwell – Deep Freezer (Model SFR450DDU)", status: "Operational", needsCal: false },
    { name: "Ice Flake Machine", status: "IN MAINTENANCE", needsCal: false },
    { name: "Medox – pH Meter", status: "Operational", needsCal: true },
    { name: "Bhanu – Double Distillation Easy Still Mark 2000 DDQ XL", status: "Operational", needsCal: false },
    { name: "Borosil – Double Distillation Unit", status: "Operational", needsCal: false },
    { name: "Lab Man – UV Visible Spectrophotometer (Model UV 1200)", status: "Operational", needsCal: true },
    { name: "Labtronics – Digital Flame Photometer (LT 65)", status: "Operational", needsCal: true },
    { name: "Systronics – Digital Nephelo Turbidity Meter (Model 132)", status: "Operational", needsCal: true },
    { name: "Alpha Infotech – Gel Documentation System", status: "Operational", needsCal: false },
    { name: "Medox / Weal Tech – UV Transilluminator", status: "Operational", needsCal: false },
    { name: "Labtronics – Microprocessor Colony Counter", status: "Operational", needsCal: false },
    { name: "Rashmi Scientific Company – Soxhlet Apparatus", status: "Operational", needsCal: false },
    { name: "Sonic Vibra Cell – Ultrasonicator", status: "Operational", needsCal: false },
    { name: "Endee – Gas Analyser (PA960)", status: "Operational", needsCal: true },
    { name: "Remi / Techno Instrument Co. – Homogeniser", status: "Operational", needsCal: false }
  ];

  const { data: dbEquipment, error } = await supabase.from('equipment').select('*');
  if (error) {
    console.error(error);
    return;
  }

  const foundMasterNames = new Set();
  
  // Clean mapping since I already partially messed it up
  // Anything that is still in the DB that matches will be updated
  for (const item of dbEquipment) {
    // skip 'Test' name that I just set
    if (item.name === 'Test') item.name = 'Centrifuge (Micro centrifuge)';

    const dbName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedItem = null;
    
    // exact matches if they exist
    matchedItem = masterList.find(m => m.name === item.name);
    
    if (!matchedItem) {
      for (const m of masterList) {
        const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (mName.includes(dbName) || dbName.includes(mName)) {
          matchedItem = m;
          break;
        }
      }
    }

    // Special manual cases that might still be left
    const manualMap = {
      "Fermenter": "Bio Chemical India – Fermentor (model: Bioage 2A)",
      "Centrifuge (Micro centrifuge)": "Remi – Micro Centrifuge (12C)",
      "UV Spectrometer": "Lab Man – UV Visible Spectrophotometer (Model UV 1200)",
      "LAF": "Kadavul Electric Mechanical Industries – Laminar Air Flow",
      "Cooling Microcentrifuge": "Remi – Cooling Centrifuge (Model 412 LAG)",
      "Vortex Mixer": "Remi – Cyclo Mixer",
      "Soxhlet Extraction Unit": "Rashmi Scientific Company – Soxhlet Apparatus",
      "Probe Sonicator": "Sonic Vibra Cell – Ultrasonicator",
      "Homogenizer": "Remi / Techno Instrument Co. – Homogeniser",
      "Flame Fluorimeter": "Labtronics – Digital Flame Photometer (LT 65)",
      "Weighing Balance": "Electronic Scale",
      "BOD Incubator": "Technico – BOD Incubator",
      "Deep Freezer": "Deep Freezer – Ins Lab"
    };

    if (manualMap[item.name]) {
      matchedItem = masterList.find(m => m.name === manualMap[item.name]);
    }

    if (matchedItem) {
      foundMasterNames.add(matchedItem.name);
      
      console.log('Updating: ' + item.name + ' -> ' + matchedItem.name);
      await supabase.from('equipment').update({
        name: matchedItem.name,
        status: matchedItem.status,
        requires_calibration: matchedItem.needsCal
      }).eq('id', item.id);
      
      if (!matchedItem.needsCal) {
        await supabase.from('equipment_calibrations').delete().eq('equipment_id', item.id);
      }
    } else {
      console.log('Deleting: ' + item.name);
      await supabase.from('equipment_calibrations').delete().eq('equipment_id', item.id);
      await supabase.from('equipment').delete().eq('id', item.id);
    }
  }

  // Insert missing master list items
  for (const m of masterList) {
    if (!foundMasterNames.has(m.name)) {
      console.log('Inserting new equipment: ' + m.name);
      await supabase.from('equipment').insert({
        name: m.name,
        status: m.status,
        requires_calibration: m.needsCal,
        model: 'N/A',
        serial_number: 'N/A'
      });
    }
  }

  console.log('True Synchronization Complete!');
}

run().catch(console.error);
