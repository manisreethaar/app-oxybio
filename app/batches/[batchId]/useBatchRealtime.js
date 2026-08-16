import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

/**
 * Custom hook to listen for Realtime database changes on Batch tables.
 * Subscribes to: batches, batch_seed_trains, batch_flasks, batch_fermentation_readings
 * Filters by batchId to save bandwidth.
 * 
 * @param {string} batchId - The current batch ID
 * @param {function} onPayload - Callback that receives the Supabase Realtime payload
 */
export default function useBatchRealtime(batchId, onPayload) {
  useEffect(() => {
    if (!batchId || !onPayload) return;

    const supabase = createClient();

    // The filter string for Supabase Realtime (e.g., "batch_id=eq.uuid")
    const filter = `batch_id=eq.${batchId}`;

    const channel = supabase.channel(`batch_${batchId}`)
      // Listen to the main batch table (e.g., stage transfers)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches', filter: `id=eq.${batchId}` },
        (payload) => onPayload({ table: 'batches', ...payload })
      )
      // Listen to seed trains (e.g., media setup, sterilization)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batch_seed_trains', filter },
        (payload) => onPayload({ table: 'batch_seed_trains', ...payload })
      )
      // Listen to flasks (e.g., inoculation explosion)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batch_flasks', filter },
        (payload) => onPayload({ table: 'batch_flasks', ...payload })
      )
      // Listen to readings (e.g., ALOCA++ samples)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batch_fermentation_readings', filter },
        (payload) => onPayload({ table: 'batch_fermentation_readings', ...payload })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, onPayload]);
}
