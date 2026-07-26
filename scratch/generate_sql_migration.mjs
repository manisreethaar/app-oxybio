import fs from 'fs';

const data = JSON.parse(fs.readFileSync('e:\\OXYBIO\\scratch\\alcoa_full_results.json', 'utf8'));

let sql = `-- Phase 6: Global ALCOA++ and GDP Remediation (Explicit Migrations)\n\n`;

sql += `-- 1. Create generic trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the audit_log_trigger_func to fallback to auth.uid()
CREATE OR REPLACE FUNCTION audit_log_trigger_func()
RETURNS trigger AS $$
DECLARE
    emp_id uuid;
    audit_reason text;
BEGIN
    -- Read the transaction-scoped audit reason (returns NULL if not set)
    BEGIN
        audit_reason := current_setting('app.audit_reason', true);
    EXCEPTION WHEN OTHERS THEN
        audit_reason := NULL;
    END;

    -- Extract employee ID
    BEGIN
        IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
            IF row_to_json(NEW) ? 'updated_by' THEN
                emp_id := (row_to_json(NEW)->>'updated_by')::uuid;
            ELSIF row_to_json(NEW) ? 'created_by' THEN
                emp_id := (row_to_json(NEW)->>'created_by')::uuid;
            ELSIF row_to_json(NEW) ? 'operator_id' THEN
                emp_id := (row_to_json(NEW)->>'operator_id')::uuid;
            ELSIF row_to_json(NEW) ? 'logged_by' THEN
                emp_id := (row_to_json(NEW)->>'logged_by')::uuid;
            ELSIF row_to_json(NEW) ? 'tested_by' THEN
                emp_id := (row_to_json(NEW)->>'tested_by')::uuid;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        emp_id := NULL;
    END;

    -- Fallback to auth.uid() if no attribution column was found or it was null
    IF emp_id IS NULL THEN
        BEGIN
            emp_id := auth.uid();
        EXCEPTION WHEN OTHERS THEN
            emp_id := NULL;
        END;
    END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, new_data, changed_by, reason)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', row_to_json(NEW)::jsonb, emp_id, audit_reason);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, old_data, new_data, changed_by, reason)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, emp_id, audit_reason);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, old_data, reason)
        VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', row_to_json(OLD)::jsonb, audit_reason);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Explicit ALCOA++ Additions for all tables\n\n`;

for (const module in data) {
    sql += `-- Module: ${module}\n`;
    for (const table of data[module]) {
        // Skip system tables or those without ID (can't trigger easily if no PK known, but let's assume they all have ID based on schema)
        if (table.name === 'system_audit_logs' || table.name === 'schema_migrations') continue;
        
        sql += `ALTER TABLE IF EXISTS ${table.name}\n`;
        const adds = [];
        if (!table.hasCreatedAt) adds.push(`  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
        if (!table.hasUpdatedAt) adds.push(`  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        if (!table.hasCreatedBy) adds.push(`  ADD COLUMN IF NOT EXISTS created_by UUID`);
        if (!table.hasUpdatedBy) adds.push(`  ADD COLUMN IF NOT EXISTS updated_by UUID`);
        
        if (adds.length > 0) {
            sql += adds.join(',\n') + ';\n';
        } else {
            sql += `  -- No columns to add;\n`;
            // dirty hack to keep valid SQL if there's nothing to alter
            sql = sql.replace(`ALTER TABLE IF EXISTS ${table.name}\n  -- No columns to add;\n`, `-- No schema changes for ${table.name}\n`);
        }

        // Add updated_at trigger
        sql += `DROP TRIGGER IF EXISTS trg_set_updated_at_${table.name} ON ${table.name};\n`;
        sql += `CREATE TRIGGER trg_set_updated_at_${table.name} BEFORE UPDATE ON ${table.name} FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n`;

        // Add audit trigger for GDP/reason_for_change
        sql += `DROP TRIGGER IF EXISTS trg_audit_${table.name} ON ${table.name};\n`;
        sql += `CREATE TRIGGER trg_audit_${table.name} AFTER INSERT OR UPDATE OR DELETE ON ${table.name} FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_func();\n\n`;
    }
}

fs.writeFileSync('e:\\OXYBIO\\supabase\\migrations\\20260726000000_global_alcoa_gdp_remediation.sql', sql);
console.log("Migration generated.");
