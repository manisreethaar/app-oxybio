const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: "postgres://postgres:3bShNEHBT2DXYpda@db.ttikqclvbewkollnjvza.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase DB');

    // Create Inventory Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          item_name TEXT NOT NULL,
          category TEXT CHECK (category IN ('Raw Material', 'Packaging', 'Consumable', 'Reagent', 'Other')),
          quantity NUMERIC DEFAULT 0,
          unit TEXT NOT NULL,
          minimum_threshold NUMERIC DEFAULT 0,
          last_restocked DATE,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Created inventory table');

    // Create Equipment Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          model TEXT,
          serial_number TEXT,
          status TEXT CHECK (status IN ('active', 'maintenance', 'broken', 'retired')),
          location TEXT,
          last_calibrated DATE,
          next_calibration DATE,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Created equipment table');

    // Add RLS
    await client.query(`
      ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
      ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS admin_all_inventory ON inventory;
      DROP POLICY IF EXISTS staff_select_inventory ON inventory;
      CREATE POLICY admin_all_inventory ON inventory FOR ALL USING (is_admin());
      CREATE POLICY staff_select_inventory ON inventory FOR SELECT USING (true);

      DROP POLICY IF EXISTS admin_all_equipment ON equipment;
      DROP POLICY IF EXISTS staff_select_equipment ON equipment;
      CREATE POLICY admin_all_equipment ON equipment FOR ALL USING (is_admin());
      CREATE POLICY staff_select_equipment ON equipment FOR SELECT USING (true);
    `);
    console.log('Enabled RLS on new tables');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

migrate();
