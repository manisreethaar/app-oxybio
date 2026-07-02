import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const toRemoveCal = [
    "Tech Lab Instruments – Incubator",
    "Technico – BOD Incubator",
    "Hybridization Oven – Scigenics Biotech",
    "Plant Growth Chamber (Orbitek) – Scigenics Biotech",
    "Industrial & Laboratory Tools Corporation – Hot Air Oven",
    "Precision Lab Furniture Industries – Hot Air Oven",
    "Deep Freezer – Ins Lab",
    "Rockwell – Deep Freezer",
    "Rockwell – Deep Freezer (Model SFR450DDU)",
    "ITC Industrial and Laboratory – Refrigerator Water Bath",
    "Rashmi – Water Bath",
    "Oil Bath",
    "Autoclave",
    "Kadavul Electric Mechanical Industries – Laminar Air Flow",
    "Kemi – Laminar Air Flow",
    "Bio Chemical India – Fermentor (model: Bioage 2A)",
    "Scigenics – Fermentor",
    "Remi – Cooling Centrifuge (Model 412 LAG)",
    "Alpha Infotech – Gel Documentation System",
    "Sonic Vibra Cell – Ultrasonicator"
  ];

  const { data: dbEquipment, error } = await supabase.from('equipment').select('id, name');
  if (error) {
    console.error(error);
    return;
  }

  let removedCount = 0;
  for (const item of dbEquipment) {
    if (toRemoveCal.includes(item.name)) {
      console.log('Removing calibrations for: ' + item.name);
      await supabase.from('equipment_calibrations').delete().eq('equipment_id', item.id);
      removedCount++;
    }
  }

  console.log('Successfully removed calibration tracking for ' + removedCount + ' items.');
}

run().catch(console.error);
