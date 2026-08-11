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
  const [stockRes, itemsRes, vendorsRes] = await Promise.all([
    supabase.from('inventory_stock').select('*, inventory_items(name, unit, category), vendors(name)').order('expiry_date', { ascending: true }).range(0, 24),
    supabase.from('inventory_items').select('*, created_by, creator:employees!inventory_items_created_by_fkey(id, full_name, initials)').is('archived_at', null).order('name').limit(1000),
    supabase.from('vendors').select('*').is('archived_at', null).order('name').limit(500)
  ]);

  return (
    <ErrorBoundary>
      <InventoryClient
        initialStock={stockRes.data || []}
        initialItems={itemsRes.data || []}
        initialVendors={vendorsRes.data || []}
        initialSearch={searchParams?.search || ''}
      />
    </ErrorBoundary>
  );
}
