import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { getLabBenchSources } from '../queries';
import LogClient from './LogClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LogPage() {
  const supabase = createClient();
  const user = await getApiUserOrFallback(supabase);
  if (!user) redirect('/login');

  const sources = await getLabBenchSources(supabase);

  return <LogClient initialSources={sources} />;
}
