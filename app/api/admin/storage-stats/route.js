import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get database size via pg_database_size
    const { data: dbSizeData, error: dbErr } = await supabase.rpc('get_db_size');
    
    // Get per-table row counts for the most important tables
    const tables = [
      'employees', 'attendance_log', 'activity_log', 'tasks',
      'batches', 'cell_bank_vials', 'cell_bank_vial_logs',
      'inventory_usage', 'leave_applications', 'lab_notebook_entries',
      'ph_readings', 'deviations', 'sop_acknowledgements'
    ];

    const countResults = await Promise.all(
      tables.map(async (table) => {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        return { table, count: error ? null : count };
      })
    );

    // Get storage bucket usage
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketStats = [];
    if (buckets) {
      for (const bucket of buckets) {
        const { data: files } = await supabase.storage.from(bucket.name).list('', { limit: 1000 });
        const totalBytes = (files || []).reduce((sum, f) => sum + (f.metadata?.size || 0), 0);
        bucketStats.push({ name: bucket.name, fileCount: (files || []).length, totalBytes });
      }
    }

    // Supabase free plan limits
    const DB_LIMIT_MB = 500;
    const STORAGE_LIMIT_MB = 1024;

    const dbSizeMB = dbSizeData ? Math.round(dbSizeData / 1024 / 1024 * 100) / 100 : null;
    const storageTotalBytes = bucketStats.reduce((s, b) => s + b.totalBytes, 0);
    const storageMB = Math.round(storageTotalBytes / 1024 / 1024 * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        database: {
          usedMB: dbSizeMB,
          limitMB: DB_LIMIT_MB,
          percentUsed: dbSizeMB ? Math.round((dbSizeMB / DB_LIMIT_MB) * 100) : null
        },
        storage: {
          usedMB: storageMB,
          limitMB: STORAGE_LIMIT_MB,
          percentUsed: Math.round((storageMB / STORAGE_LIMIT_MB) * 100),
          buckets: bucketStats
        },
        tableCounts: countResults
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
