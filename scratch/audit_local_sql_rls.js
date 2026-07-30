const fs = require('fs');
const path = require('path');

const dirsToScan = ['e:/OXYBIO', 'e:/OXYBIO/supabase', 'e:/OXYBIO/supabase/migrations'];
let allSqlFiles = [];

for (const dir of dirsToScan) {
    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file.endsWith('.sql')) {
                allSqlFiles.push(path.join(dir, file));
            }
        }
    }
}

let tables = new Set();
let rlsEnabled = new Set();
let policies = [];

const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
const enableRlsRegex = /ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const createPolicyRegex = /CREATE\s+POLICY\s+["']?([^"']+)["']?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)(?:.*?TO\s+([a-zA-Z0-9_,\s]+))?(?:.*?USING\s*\((.*?)\))?/gis;

for (const file of allSqlFiles) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Find tables
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
        tables.add(match[1].toLowerCase());
    }

    // Find RLS enabled
    while ((match = enableRlsRegex.exec(content)) !== null) {
        rlsEnabled.add(match[1].toLowerCase());
    }

    // Find policies
    while ((match = createPolicyRegex.exec(content)) !== null) {
        const policyName = match[1];
        const tableName = match[2].toLowerCase();
        const toClause = match[3] ? match[3].toLowerCase().trim() : null;
        const usingClause = match[4] ? match[4].trim() : null;

        policies.push({
            policyName,
            tableName,
            toClause,
            usingClause,
            file: path.basename(file)
        });
    }
}

const missingRLS = Array.from(tables).filter(t => !rlsEnabled.has(t));

const permissivePolicies = policies.filter(p => {
    // Check if TO clause contains 'public' or 'anon'
    const isPublic = p.toClause && (p.toClause.includes('public') || p.toClause.includes('anon'));
    // Or if it's implicitly public (no TO clause) and USING clause is very simple or missing
    const isImplicitPublic = !p.toClause;
    
    if (isPublic || isImplicitPublic) {
        // Evaluate if USING clause is too permissive
        if (!p.usingClause || p.usingClause.toLowerCase() === 'true' || p.usingClause === '(true)') {
            return true;
        }
    }
    return false;
});

console.log("=== STATIC RLS AUDIT REPORT (From SQL Files) ===");
console.log(`\n🚨 Tables missing RLS (${missingRLS.length}):`);
missingRLS.sort().forEach(t => console.log(` - ${t}`));

console.log(`\n⚠️ Permissive/Public Policies found (${permissivePolicies.length}):`);
permissivePolicies.forEach(p => {
    console.log(` - ${p.tableName} -> ${p.policyName} (To: ${p.toClause || 'ALL/PUBLIC'}, Using: ${p.usingClause || 'NONE'}) [in ${p.file}]`);
});

fs.writeFileSync('e:/OXYBIO/scratch/static_rls_audit.json', JSON.stringify({ missingRLS, permissivePolicies }, null, 2));
