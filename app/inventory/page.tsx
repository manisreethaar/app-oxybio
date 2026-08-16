import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import InventoryClient from './InventoryClient';
import { redirect } from 'next/navigation';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const metadata = { title: 'Inventory - OxyOS' };

export default async function InventoryPage({ searchParams }: { searchParams?: { search?: string } }) {
  const supabase = createClient();
  // Identity already validated by middleware.js (which also gates
  // /inventory) — no need to call supabase.auth.getUser() again here.
  const user = getRequestUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch initial data for the first page
  const [stockRes, itemsRes, vendorsRes, prRes, usageRes] = await Promise.all([
    supabase.from('inventory_stock').select('*, inventory_items(name, unit, category), vendors(name)').order('expiry_date', { ascending: true }).limit(1000),
    supabase.from('inventory_items').select('*, created_by, creator:employees!inventory_items_created_by_fkey(id, full_name, initials)').is('archived_at', null).order('name').limit(1000),
    supabase.from('vendors').select('*').is('archived_at', null).order('name').limit(500),
    supabase.from('purchase_requests').select('*, requester:employees!purchase_requests_requested_by_fkey(full_name, initials)').order('created_at', { ascending: false }).limit(100),
    supabase.from('inventory_usage').select(`
      id, quantity_used, created_at, stage, notes,
      inventory_stock!inner(id, supplier_batch_number, inventory_items(name)),
      batches(id, batch_id, status, product_name),
      titration_logs(id, sample_name, source_label),
      bioprocess_experiments(id, title),
      samples(id, sample_id, label)
    `).order('created_at', { ascending: false }).limit(100)
  ]);

  // Format traceability records to match the API
  const initialTraceability = (usageRes.data || []).map((row: any) => {
    let context = 'Unknown Context';
    let contextLabel = '';

    if (row.batches?.batch_id) {
      context = 'Production Batch';
      contextLabel = `${row.batches.batch_id} — ${row.batches.product_name}`;
    } else if (row.titration_logs?.id) {
      context = 'Titration';
      contextLabel = `TA-${row.titration_logs.id.slice(0,6)}: ${row.titration_logs.sample_name}`;
    } else if (row.bioprocess_experiments?.id) {
      context = 'R&D Experiment';
      contextLabel = row.bioprocess_experiments.title;
    } else if (row.samples?.id) {
      context = 'Lab Sample';
      contextLabel = `${row.samples.sample_id} — ${row.samples.label}`;
    } else if (row.stage) {
      context = row.stage.replace('_', ' ').toUpperCase();
      contextLabel = row.notes || 'System Deduction';
    }

    return {
      id: row.id,
      date: row.created_at,
      quantity_used: row.quantity_used,
      stock_id: row.inventory_stock?.id,
      lot_number: row.inventory_stock?.supplier_batch_number || 'N/A',
      item_name: row.inventory_stock?.inventory_items?.name || 'Unknown Item',
      context,
      context_label: contextLabel,
      notes: row.notes,
      batch_uuid: row.batches?.id,
    };
  });

  return (
    <ErrorBoundary>
      <InventoryClient
        initialStock={stockRes.data || []}
        initialItems={itemsRes.data || []}
        initialVendors={vendorsRes.data || []}
        initialPurchaseRequests={prRes.data || []}
        initialTraceability={initialTraceability}
        initialSearch={searchParams?.search || ''}
      />
    </ErrorBoundary>
  );
}
