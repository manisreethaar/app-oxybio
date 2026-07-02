import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const masterList = [
    { name: "Autoclave", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Bio Chemical India – Fermentor (model: Bioage 2A)", status: "PARTIALLY FUNCTIONAL", cat: "Major Equipment", needsCal: true },
    { name: "Scigenics – Fermentor", status: "NOT WORKING", cat: "Major Equipment", needsCal: true },
    { name: "Kadavul Electric Mechanical Industries – Laminar Air Flow", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Kemi – Laminar Air Flow", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Tech Lab Instruments – Incubator", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Technico – BOD Incubator", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Hybridization Oven – Scigenics Biotech", status: "IN MAINTENANCE", cat: "Major Equipment", needsCal: true },
    { name: "Plant Growth Chamber (Orbitek) – Scigenics Biotech", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Bino CXI – Microscope", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Remi – Clinical Centrifuge", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Remi – Cooling Centrifuge (Model 412 LAG)", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Remi – Micro Centrifuge (12C)", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Remi – R-8C Centrifuge", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Remi – Centrifuge (KA 6775)", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Deen Instruments – Magnetic Stirrer", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Remi – Cyclo Mixer", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Orbital Shaker – Scigenics Biotech", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Orbital Water Bath Shaker – Ind Labs", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Rotary Shaker – Ind Labs", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "ITC Industrial and Laboratory – Refrigerator Water Bath", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Rashmi – Water Bath", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Oil Bath", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Cyberlab – Electronic Weighing Machine (Max 600 g)", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Electronic Scale", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Weighing Machine (Electronic, Max 300 g)", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Industrial & Laboratory Tools Corporation – Hot Air Oven", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Precision Lab Furniture Industries – Hot Air Oven", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Golden / Butterfly – Stove", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Hot Plate", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Microwave Oven – Samsung", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "LG – Refrigerator", status: "Operational", cat: "Major Equipment", needsCal: false },
    { name: "LG – Refrigerator (Model GL 328)", status: "Operational", cat: "Major Equipment", needsCal: false },
    { name: "Deep Freezer – Ins Lab", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Rockwell – Deep Freezer", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Rockwell – Deep Freezer (Model SFR450DDU)", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Ice Flake Machine", status: "IN MAINTENANCE", cat: "Minor Equipment", needsCal: false },
    { name: "Medox – pH Meter", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Bhanu – Double Distillation Easy Still Mark 2000 DDQ XL", status: "Operational", cat: "Major Equipment", needsCal: false },
    { name: "Borosil – Double Distillation Unit", status: "Operational", cat: "Major Equipment", needsCal: false },
    { name: "Lab Man – UV Visible Spectrophotometer (Model UV 1200)", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Labtronics – Digital Flame Photometer (LT 65)", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Systronics – Digital Nephelo Turbidity Meter (Model 132)", status: "Operational", cat: "Minor Equipment", needsCal: true },
    { name: "Alpha Infotech – Gel Documentation System", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Medox / Weal Tech – UV Transilluminator", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Labtronics – Microprocessor Colony Counter", status: "Operational", cat: "Minor Equipment", needsCal: false },
    { name: "Rashmi Scientific Company – Soxhlet Apparatus", status: "Operational", cat: "Major Equipment", needsCal: false },
    { name: "Sonic Vibra Cell – Ultrasonicator", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Endee – Gas Analyser (PA960)", status: "Operational", cat: "Major Equipment", needsCal: true },
    { name: "Remi / Techno Instrument Co. – Homogeniser", status: "Operational", cat: "Minor Equipment", needsCal: false }
  ];

  const { data: dbEquipment, error } = await supabase.from('equipment').select('*');
  if (error) {
    console.error(error);
    return;
  }

  const foundMasterNames = new Set();
  
  // Custom manual mappings
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
    "Weighing Balance": "Electronic Scale"
  };

  for (const item of dbEquipment) {
    let matchedItem = null;
    
    if (manualMap[item.name]) {
      matchedItem = masterList.find(m => m.name === manualMap[item.name]);
    } else {
      const dbName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const m of masterList) {
        const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (mName.includes(dbName) || dbName.includes(mName)) {
          matchedItem = m;
          break;
        }
      }
    }

    if (matchedItem) {
      foundMasterNames.add(matchedItem.name);
      
      console.log('Updating: ' + item.name + ' -> ' + matchedItem.name);
      await supabase.from('equipment').update({
        name: matchedItem.name,
        category: matchedItem.cat,
        status: matchedItem.status
      }).eq('id', item.id);
      
      if (!matchedItem.needsCal) {
        console.log('Removing calibration records for: ' + matchedItem.name);
        await supabase.from('equipment_calibrations').delete().eq('equipment_id', item.id);
      }
    } else {
      console.log('Deleting unlisted equipment: ' + item.name);
      // Delete any associated calibrations first to prevent foreign key errors
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
        category: m.cat,
        status: m.status,
        model: 'N/A',
        serial_number: 'N/A'
      });
    }
  }

  console.log('Synchronization Complete!');
}

run().catch(console.error);
