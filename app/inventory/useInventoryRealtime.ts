import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export function useInventoryRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    // Subscribe to inventory_stock and inventory_items
    const channel = supabase.channel('inventory_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
