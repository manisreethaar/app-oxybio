require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const data = {
  "RAW MATERIALS LIST": [
    "AMPHOTERIC SURFACTANTS (CAPB)",
    "AOS Liquid",
    "Sodium Carbonate Anhydrous",
    "CDEA Flakes",
    "Acrylates Copolymer (Aqua SF-1)",
    "Dimethyldichlorosilane (DMDM Hydantoin)",
    "NaOH Flakes",
    "TETRASODIUM EDTA (VERSENE 100)",
    "Propylene glycol (PG)",
    "Cocomonoethanolamide",
    "Disodium Laureth Sulfosuccinate (DLS)",
    "Diethanolamine",
    "C - 1045",
    "Kathon CG (MIT/CMIT preservatives)",
    "Triethanolamine (TEA)",
    "Xanthan Gum",
    "Disodium EDTA",
    "Potassium Hydroxide",
    "Guar Hydroxypropyltrimonium Chloride (Guar Gum)",
    "Sodium Lauryl Ether Sulphate (SLES)",
    "Carbomer (Ultrez 20 / Aqua SF-1)",
    "Polyquaternium (PQ-7)",
    "Polyquaternium (PQ-10)",
    "Glycerin",
    "Cetostearyl alcohol (CSA / Cetearyl Alcohol)"
  ],
  "ANALYTICAL INSTRUMENTS": [
    "Bench top pH meter",
    "STEREO MICROSCOPE WITH LED LIGHT",
    "Hand held refractometer",
    "Centrifuge (Micro centrifuge)",
    "Ultrasonic bath (sonicator)",
    "LABORATORY WEIGHING SCALE"
  ],
  "GLASSWARES": [
    "McCartney bottles (Universal bottles)",
    "Culture tubes - 20ml",
    "Falcon tubes - 15ml",
    "Falcon tubes - 50ml",
    "Conical flasks - 250ml",
    "Burett - 50ml",
    "Burett - 100ml",
    "Pipette - 10ml",
    "Pipette - 25ml",
    "Measuring Cylinders - 10ml",
    "Measuring Cylinders - 50ml",
    "Measuring Cylinders - 100ml",
    "Measuring Cylinders - 250ml",
    "Measuring Cylinders - 500ml",
    "Measuring Cylinders - 1000ml",
    "Beaker (Glass) - 50ml",
    "Beaker (Glass) - 100ml",
    "Beaker (Glass) - 250ml",
    "Beaker (Glass) - 500ml",
    "BOD bottles (Incubation bottles)",
    "Pipette Pump",
    "Volumetric flask (250ml)",
    "Desiccator",
    "Test tubes",
    "Separatory funnels - 50ml",
    "Reagent bottles - (Clear and Amber)",
    "Erlenmeyer Flasks (Conical flasks)",
    "Condenser (Liebig condenser)",
    "Test tube racks (Plastic)",
    "Burette stand (Retort stand with clamp)",
    "Buchner funnel (Porcelain)",
    "Wash bottles (Plastic)",
    "Glass funnels (60mm)",
    "Weighing boats (Plastic)",
    "Watch Glasses"
  ],
  "PLASTICS AND CONSUMMABLES": [
    "Micropipettes (Adjustable volumes)",
    "Micropipette Tips - 10ul",
    "Micropipette Tips - 200ul",
    "Pasteur Pipettes",
    "Syringe Filters (0.22 and 0.45 micron)",
    "Parafilm",
    "Kimwipes (Lint-free wipes)",
    "Microcentrifuge Tubes - 1.5ml",
    "Microcentrifuge Tubes - 2.0ml",
    "Syringes (1ml, 5ml, 10ml, 20ml)",
    "Petri dishes (Plastic, empty P90 & P60)",
    "Sterile Cotton Swabs (Long)",
    "Inoculating loops - 10ul",
    "Inoculating loops - 1ul",
    "Inoculating loop holders",
    "Cell spreaders (L-shaped, Disposable)",
    "Disposable Gloves (Nitrile)",
    "Face masks",
    "Lab coats (Disposable or Cotton)",
    "Shoe covers (Disposable)",
    "Autoclave bags",
    "Biohazard waste bags",
    "Aluminum foil",
    "Autoclave Tape",
    "Sample bottles (Glass / Plastic) - 250ml",
    "Sample bottles (Glass / Plastic) - 500ml",
    "Cotton plugs / Non-absorbent Cotton",
    "Staining Jars (Coplin Jars) - Glass",
    "Slide Storage Boxes (Plastic / Wood)"
  ],
  "PHOTOGRAPHY / DIAGNOSTIC MEDIA": [
    "Blood Agar Base (Columbia Agar base or similar)",
    "MacConkey agar",
    "Eosin Methylene Blue (EMB) agar",
    "Soybean Casein Digest Medium (SCDM / TSB)",
    "Baird Parker Agar",
    "Sabouraud Dextrose Agar (SDA)",
    "Lauryl Tryptose Broth (LTB)",
    "Brilliant Green Bile Broth (BGBB)"
  ],
  "MICROBIOLOGY CHEMICALS": [
    "3% Hydrogen Peroxide",
    "Xylene (Solution or CP)",
    "DPX Mountant",
    "Crystal violet (Gram's Method)",
    "Gram's Iodine",
    "Safranin (Gram's counterstain)",
    "95% Ethanol OR Isopropyl alcohol",
    "Kovac's Reagent (for Indole test)",
    "Simmons Citrate Agar (Base)",
    "Methyl Red - Voges-Proskauer (MR-VP) Medium",
    "Alpha-naphthol (for VP test)",
    "Potassium Hydroxide (KOH) Solution (40% for VP test)",
    "TSI (Triple Sugar Iron) Agar",
    "Urea Agar Base (Christensen's Urea Agar base)",
    "40% Urea Solution (for Urea Agar)",
    "Motility Indole Ornithine (MIO) Medium",
    "Nitrate Broth (or Nitrate test media)",
    "Sulfanilic acid (Nitrate Reagent A)",
    "Alpha-naphthylamine (Nitrate Reagent B)",
    "Zinc powder (for nitrate reduction test)",
    "Gelatin",
    "Nutrient Broth / Peptone Water",
    "Mineral oil (sterile - for biochemical tests)",
    "Immersion oil (for microscopy)",
    "Methylene Blue",
    "Malachite green (Endospore stain)",
    "Carbol Fuchsin / Ziehl Neelsen Stain (AFB stain)",
    "Acid Alcohol (For AFB stain)",
    "Lactophenol cotton blue (for fungal staining)",
    "Lugol's Iodine",
    "Oxidase Reagent (Gordon-McLeod reagent / discs)",
    "Catalase reagent (3% H2O2)",
    "Barium Chloride (for McFarland standard)",
    "Sulfuric Acid (for McFarland standard)",
    "Lysol (Phenol / 5% Phenol solution) OR Dettol (Diluted)"
  ]
};

async function run() {
  console.log("Starting bulk insertion...");
  for (const [category, items] of Object.entries(data)) {
    console.log(`Processing category: ${category}`);
    for (const item of items) {
      const { error } = await supabase.from('inventory_items').insert({
        name: item,
        category: category,
        unit: 'pck', // Default unit for bulk inserts
        min_stock_level: 1
      });
      if (error) {
         if (error.code === '23505') {
            console.log(`Skipping ${item} - already exists`);
         } else {
            console.error(`Error inserting ${item}:`, error);
         }
      }
    }
  }
  console.log("Bulk insertion completed!");
}

run();
