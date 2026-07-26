import fs from 'fs';

const data = JSON.parse(fs.readFileSync('e:\\OXYBIO\\scratch\\alcoa_full_results.json', 'utf8'));

let md = `# GDP & ALCOA++ Final Module Checklist

> [!NOTE]
> **ALCOA++ Principles** require data to be Attributable, Legible, Contemporaneous, Original, Accurate, Complete, Consistent, Enduring, and Available. In a database schema, this translates to:
> - **Contemporaneous / Enduring**: \`created_at\`, \`updated_at\` (audit trails)
> - **Attributable**: \`created_by\`, \`updated_by\` (who did it)
> - **Traceable (GDP)**: \`reason_for_change\` or equivalent notes/audit logs

This final checklist details the compliance status across all system modules after the remediation.

`;

for (const module in data) {
  md += `## Module: ${module}\n\n`;
  
  if (data[module].length === 0) {
    md += `*No tables found for this module.*\n\n`;
    continue;
  }
  
  for (const table of data[module]) {
    const missing = [];
    if (!table.hasCreatedAt && !table.hasUpdatedAt) missing.push('`updated_at` / `created_at` (Contemporaneous)');
    if (!table.hasCreatedBy) missing.push('`created_by` / `logged_by` (Attributable)');
    if (!table.hasUpdatedBy) missing.push('`updated_by` (Attributable)');
    if (!table.hasReasonForChange) missing.push('`reason_for_change` / `audit log` (GDP)');
    
    if (missing.length > 0) {
      md += `- **${table.name}** is missing:\n`;
      missing.forEach(m => {
        md += `  - [ ] ${m}\n`;
      });
    } else {
      md += `- [x] **${table.name}** (Fully Compliant)\n`;
    }
  }

  md += `\n`;
}

fs.writeFileSync('C:\\Users\\manis\\.gemini\\antigravity-ide\\brain\\82c857d1-90d6-4b89-ad8f-e689e2c6a740\\alcoa_gdp_final_checklist.md', md);
console.log("Checklist generated.");
