import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export function useDownstreamRealtime(batchId) {
  const router = useRouter();

  useEffect(() => {
    if (!batchId) return;

    const supabase = createClient();
    
    // Sync straining, transitions, and batch changes instantly
    const channel = supabase.channel(`tier1-dsp-${batchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_flask_straining', filter: `batch_id=eq.${batchId}` }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches', filter: `id=eq.${batchId}` }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_flasks', filter: `batch_id=eq.${batchId}` }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, batchId]);

  return null;
}
