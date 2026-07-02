import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const catalogData = {
    'RAW MATERIALS': [],
    'REAGENTS & STAINS': [
        'Aceto carmine',
        'Barfoed\'s reagent',
        'Bial\'s reagent',
        'Biuret reagent',
        'Bromocresol green solution',
        'Bromophenol blue indicator',
        'Bromophenol blue solution',
        'Cedar wood oil',
        'Chlorophenol red solution',
        'Crystal violet solution',
        'Ehrlich\'s reagent',
        'Gentian violet stain solution aqueous',
        'Giemsa\'s stain solution',
        'Indole-3 acetic acid',
        'Lactophenol',
        'Malachite green',
        'Methyl orange solution',
        'Methylene blue alkaline',
        'Methylene blue aqueous',
        'Methylene blue staining solution aqueous',
        'Molisch\'s reagent',
        'Morner\'s reagent',
        'Ninhydrin',
        'Phenol reagent (Folin-Ciocalteu)',
        'Phenolphthalein solution',
        'Picric acid saturated solution',
        'Pure linseed oil',
        'Robert\'s reagent',
        'Safranine stain solution',
        'Seliwanoff\'s reagent',
        'Tollen\'s reagent',
        'Trypan blue solution',
        'Wright\'s stain solution',
        '1,10 Phenanthroline hydrate',
        '3,5-Dinitrosalicylic acid (DNS)',
        'Albumin Bovine Fraction (BSA)',
        'Anthrone',
        'Egg albumine',
        'Egg albumine flakes',
        'Iodine Resublimed',
        'Kinetin pure',
        'L-Leucine',
        'Orcinol',
        'Proteinase K',
        'Pyridoxine hydrochloride',
        'Alizarin Red',
        'Benedict\'s Qualitative Reagent',
        'Carbon Fuchsin Strong',
        'Fehling\'s Solution I',
        'Fehling\'s Solution II',
        'Gower\'s Solution',
        'Hydrogen Peroxide',
        'Jenner\'s Stain',
        'Lactophenol Cotton Blue',
        'Leishman\'s Stain',
        'May-Grunwald\'s Eosin Methylene Blue Modified Solution',
        'Potassium Permanganate',
        'Silica Gel G',
        'Silica Gel G for TLC',
        'Silica Gel White',
        'Sodium Hypochlorite'
    ],
    'CHEMICALS & BIOCHEMICALS': [
        'Acetaldehyde',
        'Acetamide',
        'Acetanilide',
        'Acetic Acid',
        'Acetic Acid Glacial',
        'Acetone',
        'Acetyl Acetate',
        'Acrylamide',
        'Activated Charcoal',
        'Amyl Alcohol',
        'Benzaldehyde',
        'Benzoic Acid',
        'Carbon Tetrachloride',
        'Carboxymethyl Cellulose Sodium Salt',
        'Cetrimide',
        'Cetyltrimethyl Ammonium Bromide (CTAB)',
        'Cholesterol',
        'Citric Acid',
        'Cottonseed Oil',
        'Cyclohexanone',
        'D-Fructose',
        'D-Sorbitol Powder',
        'Dextrose Extra Pure',
        'Diacetyl Monoxime',
        'Dimethyl Sulfoxide (DMSO)',
        'Diphenylamine',
        'Fructose',
        'Formamide',
        'Gallic Acid',
        'Glutaraldehyde',
        'Glycerol',
        'Glycolic Acid 70%',
        'Hexane',
        'Hydroquinone',
        'Isoamyl Alcohol',
        'Lactose',
        'L-Ascorbic Acid (Vitamin C)',
        'Methanol',
        'Meso-Inositol',
        'Methyl Cellulose',
        'Naphthol',
        'Oxalic Acid',
        'Paraffin Liquid Colourless',
        'Paraffin Wax',
        'Perchloroethylene',
        'Petroleum Ether',
        'Petroleum Jelly Yellow',
        'Phthalic Acid',
        'Polyethylene Glycol (PEG)',
        'Polyvinylpyrrolidone K30 (PVP)',
        'Potassium Oxalate',
        'Propionic Acid',
        'Pyridine',
        'Salicylic Acid',
        'Sodium Alginate',
        'Sodium Benzoate',
        'Sodium Carbonate',
        'Sodium Chloride',
        'Sodium Citrate',
        'Sodium Nitroprusside',
        'Sodium Sulphide Flakes',
        'Zinc Acetate',
        'Zinc Carbonate',
        'Zinc Chloride Anhydrous',
        'Zinc Sulphate',
        'Ficoll Type 400',
        'Tween 20',
        'Tween 80',
        'Folic Acid',
        'Glycine'
    ]
  };

  const { data, error } = await supabase.from('inventory_items').select('*');
  if(error) {
    console.error(error);
    return;
  }

  const toDelete = [];
  const toUpdate = [];

  for(const item of data) {
    let currentCat = (item.category || '').toUpperCase();
    const nameLower = item.name.toLowerCase().trim();
    
    // Check master list for REAGENTS and CHEMICALS
    let expectedCat = null;
    
    if (catalogData['REAGENTS & STAINS'].find(n => n.toLowerCase() === nameLower || nameLower.includes(n.toLowerCase()))) {
      expectedCat = 'REAGENTS & STAINS';
    } else if (catalogData['CHEMICALS & BIOCHEMICALS'].find(n => n.toLowerCase() === nameLower || nameLower.includes(n.toLowerCase()))) {
      expectedCat = 'CHEMICALS & BIOCHEMICALS';
    }

    // Is it a raw material? Let's just normalize the name if it is
    if (currentCat.includes('RAW MATERIAL')) {
       if (currentCat !== 'RAW MATERIALS') {
          toUpdate.push({ id: item.id, name: item.name, oldCat: currentCat, newCat: 'RAW MATERIALS' });
       }
       continue;
    }

    if (currentCat.includes('CHEMICAL') || currentCat.includes('REAGENT') || currentCat.includes('STAIN')) {
      if (expectedCat) {
        if (currentCat !== expectedCat) {
          toUpdate.push({ id: item.id, name: item.name, oldCat: currentCat, newCat: expectedCat });
        }
      } else {
        // According to user, if it's a chemical not in list, keep it
        let targetCat = currentCat.includes('REAGENT') || currentCat.includes('STAIN') ? 'REAGENTS & STAINS' : 'CHEMICALS & BIOCHEMICALS';
        if (currentCat !== targetCat) {
          toUpdate.push({ id: item.id, name: item.name, oldCat: currentCat, newCat: targetCat, note: 'Not in master list but keeping' });
        }
      }
    } else {
       // It's not raw material, chemical, or reagent. E.g. Glassware, Consumables, Microbiological Media
       // I'll keep Media if it contains "MEDIA" or is it a consumable? The user said "remove glassware, other unnecessary conumable keep only chemicals, reagents and raw materials"
       toDelete.push({ id: item.id, name: item.name, cat: currentCat });
    }
  }

  const out = \`
Items to Delete: \${toDelete.length}
\${toDelete.map(x => \`- [\${x.cat}] \${x.name}\`).join('\\n')}

Items to Re-Categorize: \${toUpdate.length}
\${toUpdate.map(x => \`- \${x.name} (\${x.oldCat} -> \${x.newCat}) \${x.note ? x.note : ''}\`).join('\\n')}
  \`;
  
  fs.writeFileSync('C:/Users/manis/.gemini/antigravity-ide/brain/0ec63ea7-6ec8-4384-87d9-85c3f49b6e9b/scratch/analysis.txt', out);
  console.log('Analysis written to scratch/analysis.txt');
}

run().catch(console.error);
