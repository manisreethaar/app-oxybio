import useSWR from 'swr';
import { createClient } from '@/utils/supabase/client';

const fetcher = async ({ table, select, filter, single, order }) => {
  const supabase = createClient();
  let query = supabase.from(table).select(select);
  
  if (filter) {
    if (filter.eq) query = query.eq(filter.eq[0], filter.eq[1]);
    if (filter.neq) query = query.neq(filter.neq[0], filter.neq[1]);
    if (filter.in) query = query.in(filter.in[0], filter.in[1]);
  }
  
  if (order) {
    query = query.order(order.column, { ascending: order.ascending ?? true });
  }

  if (single) {
    query = query.maybeSingle();
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

export function useData({ table, select = '*', filter, single = false, order, options = {} }) {
  // Serialize the key for SWR deduplication
  const key = table ? { table, select, filter, single, order } : null;
  
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120000,  // Deduplicate requests within 2 minutes
    ...options
  });

  return {
    data,
    error,
    isLoading,
    mutate
  };
}
