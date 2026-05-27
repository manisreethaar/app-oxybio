import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(request) {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!url) {
    return NextResponse.json({ error: 'No database URL found in environment' }, { status: 500 });
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const queries = [
      `ALTER TABLE public.shelf_life_studies ADD COLUMN IF NOT EXISTS flask_id TEXT;`,
      `ALTER TABLE public.taste_panels ADD COLUMN IF NOT EXISTS flask_id TEXT;`,
      // Ensure shelf_life_studies exists in case they didn't run the previous migration either
      `CREATE TABLE IF NOT EXISTS public.shelf_life_studies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
        flask_id TEXT,
        storage_condition TEXT NOT NULL,
        test_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
        start_date DATE NOT NULL,
        status TEXT DEFAULT 'In Progress',
        created_by UUID REFERENCES public.employees(id),
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );`,
      `CREATE TABLE IF NOT EXISTS public.shelf_life_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shelf_life_id UUID NOT NULL REFERENCES public.shelf_life_studies(id) ON DELETE CASCADE,
        study_month INTEGER NOT NULL,
        test_date DATE NOT NULL,
        test_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        logged_by UUID REFERENCES public.employees(id),
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(shelf_life_id, study_month)
      );`,
      `ALTER TABLE public.shelf_life_studies ENABLE ROW LEVEL SECURITY;`,
      `ALTER TABLE public.shelf_life_logs ENABLE ROW LEVEL SECURITY;`,
      `NOTIFY pgrst, 'reload schema';`
    ];

    for (const q of queries) {
      await client.query(q);
    }

    return NextResponse.json({ success: true, message: 'Migrations applied successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
