import { createClient } from '@/utils/supabase/server';
import InventoryClient from './InventoryClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Inventory - OxyOS' };

export default async function InventoryPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/login');
  }

  // Fetch initial data for the first page
  const [stockRes, itemsRes, vendorsRes] = await Promise.all([
    supabase.from('inventory_stock').select('*, inventory_items(name, unit, category), vendors(name)').order('expiry_date', { ascending: true }).range(0, 24),
    supabase.from('inventory_items').select('*').order('name').limit(1000),
    supabase.from('vendors').select('*').order('name').limit(500)
  ]);

  return (
    <InventoryClient 
      initialStock={stockRes.data || []}
      initialItems={itemsRes.data || []}
      initialVendors={vendorsRes.data || []}
    />
  );
}
