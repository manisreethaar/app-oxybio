import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export function useIncubationRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    // Subscribe to incubation table
    const channel = supabase.channel('tier1-incubation-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sample_incubation_records' }, (payload) => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
