import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export function useDocumentsRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    const channel = supabase.channel('tier1-documents-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, (payload) => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
