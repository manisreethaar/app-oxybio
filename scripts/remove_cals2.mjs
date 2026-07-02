import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const toRemoveCal = [
    "Tech Lab Instruments",
    "Technico – BOD Incubator",
    "Hybridization Oven",
    "Plant Growth Chamber",
    "Hot Air Oven",
    "Deep Freezer",
    "Water Bath",
    "Oil Bath",
    "Autoclave",
    "Laminar Air Flow",
    "Fermentor",
    "Cooling Centrifuge",
    "Gel Documentation",
    "Ultrasonicator"
  ];

  const { data: dbEquipment, error } = await supabase.from('equipment').select('id, name');
  if (error) {
    console.error(error);
    return;
  }

  let removedCount = 0;
  for (const item of dbEquipment) {
    const isMatch = toRemoveCal.some(target => item.name.includes(target));
    if (isMatch) {
      console.log('Removing calibrations for: ' + item.name);
      await supabase.from('equipment_calibrations').delete().eq('equipment_id', item.id);
      removedCount++;
    }
  }

  console.log('Successfully removed calibration tracking for ' + removedCount + ' items.');
}

run().catch(console.error);
