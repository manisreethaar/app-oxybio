import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export function useEquipmentRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    // Subscribe to all equipment-related tables
    const channel = supabase.channel('tier1-equipment-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, (payload) => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_logs' }, (payload) => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_tickets' }, (payload) => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
