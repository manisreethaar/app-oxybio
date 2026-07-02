import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

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

  const toDelete = [];
  const toKeep = [];

  for (const item of dbEquipment) {
    // Normalise names to match
    const dbName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedItem = null;

    for (const m of masterList) {
      const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (mName.includes(dbName) || dbName.includes(mName)) {
        matchedItem = m;
        break;
      }
    }

    if (matchedItem) {
      toKeep.push({ dbId: item.id, dbName: item.name, matched: matchedItem });
    } else {
      toDelete.push({ id: item.id, name: item.name, status: item.status });
    }
  }

  const result = [
    `Found ${dbEquipment.length} total equipment items in DB.`,
    `Items to Delete: ${toDelete.length}`,
    ...toDelete.map(x => `- ${x.name}`),
    '',
    `Items to Update/Keep: ${toKeep.length}`,
    ...toKeep.map(x => `- ${x.dbName} -> ${x.matched.name} | ${x.matched.cat} | ${x.matched.status} | Cal: ${x.matched.needsCal}`)
  ].join('\n');

  fs.writeFileSync('C:/Users/manis/.gemini/antigravity-ide/brain/0ec63ea7-6ec8-4384-87d9-85c3f49b6e9b/scratch/equipment_analysis.txt', result);
  console.log('Analysis written to scratch/equipment_analysis.txt');
}

run().catch(console.error);
