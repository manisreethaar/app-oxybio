import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export function useLabNotebookRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    // Subscribe to lab_notebook_entries
    const channel = supabase.channel('tier1-lab-notebook-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_notebook_entries' }, (payload) => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
