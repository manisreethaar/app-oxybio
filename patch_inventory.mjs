import fs from 'fs';

const file = 'app/inventory/InventoryClient.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Find lines by exact content patterns (UTF-8 safe)
let catalogStart = -1, catalogEnd = -1;
for (let i = 0; i < lines.length; i++) {
  // Match line 523: `    const catalogData = {`
  if (lines[i].trimEnd() === '    const catalogData = {') {
    catalogStart = i;
    console.log(`Found catalogData start at line ${i+1}`);
  }
  // Match line 580: `    };`  (end of catalogData, before "// Build a flat array")
  if (catalogStart !== -1 && lines[i].trimEnd() === '    };' && i > catalogStart && i < catalogStart + 100) {
    catalogEnd = i;
    console.log(`Found catalogData end at line ${i+1}`);
    break;
  }
}

if (catalogStart === -1 || catalogEnd === -1) {
  // Try alternative search
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"RAW MATERIALS LIST": [')) {
      catalogStart = i - 1; // line above has `const catalogData = {`
      console.log(`Found catalog via RAW MATERIALS LIST at line ${i+1}, setting start=${catalogStart+1}`);
    }
    if (catalogStart !== -1 && lines[i].includes('"INDICATORS AND BIOCHEMICALS": [')) {
      // Find the closing `];` then `};`
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimEnd() === '      ]') {
          // Next non-empty line should be `    };`
          for (let k = j + 1; k < j + 5; k++) {
            if (lines[k].trimEnd() === '    };') {
              catalogEnd = k;
              console.log(`Found catalogData end at line ${k+1}`);
              break;
            }
          }
          if (catalogEnd !== -1) break;
        }
      }
      break;
    }
  }
}

if (catalogStart === -1 || catalogEnd === -1) {
  console.error('ERROR: Could not find catalog boundaries');
  console.log('First 10 lines around expected area:');
  for (let i = 520; i < 530; i++) console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
  process.exit(1);
}

console.log(`Replacing lines ${catalogStart+1} to ${catalogEnd+1} (${catalogEnd - catalogStart + 1} lines)`);

// Confirm next line after catalogEnd is the comment line
console.log(`Line after end: ${JSON.stringify(lines[catalogEnd+1])}`);

const newCatalog = [
  '    const catalogData: Record<string, string[]> = {',
  '      "RAW MATERIALS": [',
  '        "Ragi (Finger Millet)",',
  '        "Karuppu Kavuni (Black Rice)",',
  '        "Urad dal",',
  '        "Agar Agar",',
  '        "Beef Extract",',
  '        "Peptone Bacteriological",',
  '        "Yeast Extract",',
  '        "MRS Broth",',
  '        "LB Broth",',
  '        "Nutrient Agar",',
  '        "Nutrient Broth",',
  '        "MacConkey Agar",',
  '        "Mueller Hinton Agar",',
  '        "Sabouraud Dextrose Agar",',
  '        "MEM (Minimum Essential Medium)"',
  '      ],',
  '      "REAGENTS & STAINS": [',
  '        "Aceto carmine",',
  "        \"Barfoed's reagent\",",
  "        \"Bial's reagent\",",
  '        "Biuret reagent",',
  '        "Bromocresol green solution",',
  '        "Bromophenol blue indicator",',
  '        "Bromophenol blue solution",',
  '        "Cedar wood oil",',
  '        "Chlorophenol red solution",',
  '        "Crystal violet solution",',
  "        \"Ehrlich's reagent\",",
  '        "Gentian violet stain solution aqueous",',
  "        \"Giemsa's stain solution\",",
  '        "Indole-3 acetic acid",',
  '        "Lactophenol",',
  '        "Malachite green",',
  '        "Methyl orange solution",',
  '        "Methylene blue alkaline",',
  '        "Methylene blue aqueous",',
  '        "Methylene blue staining solution aqueous",',
  "        \"Molisch's reagent\",",
  "        \"Morner's reagent\",",
  '        "Ninhydrin",',
  '        "Phenol reagent (Folin-Ciocalteu)",',
  '        "Phenolphthalein solution",',
  '        "Picric acid saturated solution",',
  '        "Pure linseed oil",',
  "        \"Robert's reagent\",",
  '        "Safranine stain solution",',
  "        \"Seliwanoff's reagent\",",
  "        \"Tollen's reagent\",",
  '        "Trypan blue solution",',
  "        \"Wright's stain solution\",",
  '        "1,10 Phenanthroline hydrate",',
  '        "3,5-Dinitrosalicylic acid (DNS)",',
  '        "Albumin Bovine Fraction (BSA)",',
  '        "Anthrone",',
  '        "Egg albumine",',
  '        "Egg albumine flakes",',
  '        "Iodine Resublimed",',
  '        "Kinetin pure",',
  '        "L-Leucine",',
  '        "Orcinol",',
  '        "Proteinase K",',
  '        "Pyridoxine hydrochloride",',
  '        "Alizarin Red",',
  "        \"Benedict's Qualitative Reagent\",",
  '        "Carbon Fuchsin Strong",',
  "        \"Fehling's Solution I\",",
  "        \"Fehling's Solution II\",",
  "        \"Gower's Solution\",",
  '        "Hydrogen Peroxide",',
  "        \"Jenner's Stain\",",
  '        "Lactophenol Cotton Blue",',
  "        \"Leishman's Stain\",",
  "        \"May-Grunwald's Eosin Methylene Blue Modified Solution\",",
  '        "Potassium Permanganate",',
  '        "Silica Gel G",',
  '        "Silica Gel G for TLC",',
  '        "Silica Gel White",',
  '        "Sodium Hypochlorite"',
  '      ],',
  '      "CHEMICALS & BIOCHEMICALS": [',
  '        "Acetaldehyde",',
  '        "Acetamide",',
  '        "Acetanilide",',
  '        "Acetic Acid",',
  '        "Acetic Acid Glacial",',
  '        "Acetone",',
  '        "Acetyl Acetate",',
  '        "Acrylamide",',
  '        "Activated Charcoal",',
  '        "Amyl Alcohol",',
  '        "Benzaldehyde",',
  '        "Benzoic Acid",',
  '        "Carbon Tetrachloride",',
  '        "Carboxymethyl Cellulose Sodium Salt",',
  '        "Cetrimide",',
  '        "Cetyltrimethyl Ammonium Bromide (CTAB)",',
  '        "Cholesterol",',
  '        "Citric Acid",',
  '        "Cottonseed Oil",',
  '        "Cyclohexanone",',
  '        "D-Fructose",',
  '        "D-Sorbitol Powder",',
  '        "Dextrose Extra Pure",',
  '        "Diacetyl Monoxime",',
  '        "Dimethyl Sulfoxide (DMSO)",',
  '        "Diphenylamine",',
  '        "Fructose",',
  '        "Formamide",',
  '        "Gallic Acid",',
  '        "Glutaraldehyde",',
  '        "Glycerol",',
  '        "Glycolic Acid 70%",',
  '        "Hexane",',
  '        "Hydroquinone",',
  '        "Isoamyl Alcohol",',
  '        "Lactose",',
  '        "L-Ascorbic Acid (Vitamin C)",',
  '        "Methanol",',
  '        "Meso-Inositol",',
  '        "Methyl Cellulose",',
  '        "Naphthol",',
  '        "Oxalic Acid",',
  '        "Paraffin Liquid Colourless",',
  '        "Paraffin Wax",',
  '        "Perchloroethylene",',
  '        "Petroleum Ether",',
  '        "Petroleum Jelly Yellow",',
  '        "Phthalic Acid",',
  '        "Polyethylene Glycol (PEG)",',
  '        "Polyvinylpyrrolidone K30 (PVP)",',
  '        "Potassium Oxalate",',
  '        "Propionic Acid",',
  '        "Pyridine",',
  '        "Salicylic Acid",',
  '        "Sodium Alginate",',
  '        "Sodium Benzoate",',
  '        "Sodium Salicylate",',
  '        "Sucrose",',
  '        "Sulfuric Acid",',
  '        "Synthetic Vinegar",',
  '        "Tartaric Acid",',
  '        "Urea",',
  '        "Ammonium Acetate",',
  '        "Ammonium Chloride",',
  '        "Boric Acid",',
  '        "Buffer Powder",',
  '        "Buffer Tablets",',
  '        "Dipotassium Hydrogen Orthophosphate",',
  '        "Disodium Hydrogen Orthophosphate Anhydrous",',
  '        "EDTA",',
  '        "Hydrochloric Acid",',
  '        "Hydrochloric Acid 35%",',
  '        "Ortho Phosphoric Acid",',
  '        "pH Standard 7",',
  '        "Phosphate Buffer",',
  '        "Potassium Acetate",',
  '        "Potassium Bisulphate",',
  '        "Potassium Carbonate Anhydrous",',
  '        "Potassium Chloride",',
  '        "Potassium Dihydrogen Orthophosphate",',
  '        "Potassium Hydroxide Pellets",',
  '        "Potassium Iodide",',
  '        "Potassium Sodium Tartrate",',
  '        "Potassium Sulphate",',
  '        "Sodium Acetate",',
  '        "Sodium Acetate Anhydrous",',
  '        "Sodium Acetate Trihydrate",',
  '        "Sodium Borate Alkaline Solution",',
  '        "Sodium Carbonate Anhydrous",',
  '        "Sodium Chloride",',
  '        "Sodium Dihydrogen Orthophosphate",',
  '        "Sodium Hydrogen Carbonate",',
  '        "Sodium Hydroxide Pellets",',
  '        "Sodium Iodide",',
  '        "Sodium Lauryl Sulphate (SDS)",',
  '        "Sodium Sulphate Anhydrous",',
  '        "TEMED",',
  '        "Titriplex III Pure (EDTA disodium salt)",',
  '        "Tri-Ammonium Citrate",',
  '        "Trisodium Citrate",',
  '        "Tris Buffer",',
  '        "Tris Hydrochloride",',
  '        "Aluminium Chloride Anhydrous",',
  '        "Aluminium Nitrate",',
  '        "Aluminium Potassium Sulphate",',
  '        "Ammonia",',
  '        "Ammonium Ferrous Sulphate",',
  '        "Ammonium Molybdate",',
  '        "Ammonium Nitrate",',
  '        "Ammonium Persulphate",',
  '        "Barium Chloride",',
  '        "Barium Nitrate",',
  '        "Barium Sulphate",',
  '        "Calcium Borate",',
  '        "Calcium Carbonate",',
  '        "Calcium Chloride",',
  '        "Calcium Nitrate",',
  '        "Copper Sulphate",',
  '        "Cupric Nitrate",',
  '        "Cupric Sulphate Pentahydrate",',
  '        "Epsom Salt (MgSO4)",',
  '        "Ferric Chloride Anhydrous",',
  '        "Ferrous Sulphate",',
  '        "Lead Acetate",',
  '        "Magnesium Chloride",',
  '        "Magnesium Phosphate",',
  '        "Magnesium Sulphate",',
  '        "Manganese Sulphate Monohydrate",',
  '        "Manganous Chloride",',
  '        "Nickel Chloride",',
  '        "Nitric Acid",',
  '        "Perchloric Acid 60%",',
  '        "Perchloric Acid 70%",',
  '        "Potassium Nitrate",',
  '        "Sodium Nitrite",',
  '        "Sodium Nitroprusside",',
  '        "Sodium Sulphide Flakes",',
  '        "Zinc Acetate",',
  '        "Zinc Carbonate",',
  '        "Zinc Chloride Anhydrous",',
  '        "Zinc Sulphate",',
  '        "Ficoll Type 400",',
  '        "Tween 20",',
  '        "Tween 80",',
  '        "Folic Acid",',
  '        "Glycine"',
  '      ]',
  '    };',
];

// Also fix the hazardous detection line - remove emoji checks since we removed emojis from names
// and also fix the subCats
const subCatsOld = "    'Raw Material': ['Active Ingredients', 'Excipients & Carriers', 'Packaging Materials'],\r";
const subCatsFind = "'Raw Material': ['Active Ingredients'";

// Do the splice
lines.splice(catalogStart, catalogEnd - catalogStart + 1, ...newCatalog);
console.log(`\nSpliced! New file has ${lines.length} lines`);

// Also fix hazardous logic: change emoji-based detection to false
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("hazardous: itemName.includes('⚠')")) {
    lines[i] = lines[i].replace(
      "hazardous: itemName.includes('⚠') || itemName.includes('🔥') || itemName.includes('☠'),",
      "hazardous: false,"
    );
    console.log(`Fixed hazardous detection at line ${i+1}`);
    break;
  }
}

// Also fix subCats
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("'Raw Material': ['Active Ingredients'")) {
    // Find end of subCats block
    let subEnd = i;
    for (let j = i + 1; j < i + 20; j++) {
      if (lines[j].trimEnd() === '  };') {
        subEnd = j;
        break;
      }
    }
    const newSubCats = [
      "  const subCats = {",
      "    'RAW MATERIALS': ['Active Ingredients', 'Excipients & Carriers', 'Culture Media'],",
      "    'REAGENTS & STAINS': ['Analytical Reagents', 'Dyes & Stains', 'Biochemical Test Compounds'],",
      "    'CHEMICALS & BIOCHEMICALS': ['Buffer Salts', 'Organic Solvents', 'Inorganic Salts', 'Protein & Bio Standards', 'Vitamins & Nutrients', 'Polymers & Surfactants'],",
      "  };",
    ];
    // The `const subCats = {` line is at i-1
    lines.splice(i - 1, subEnd - i + 2, ...newSubCats);
    console.log(`Fixed subCats at lines ${i}-${subEnd+1}`);
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log(`\nDone! Final file: ${lines.length} lines`);
