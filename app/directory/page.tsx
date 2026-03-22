import { createClient } from '@/utils/supabase/server';
import DirectoryClient from './DirectoryClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Directory - OxyOS' };

export default async function DirectoryPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/login');
  }

  // Pre-fetch initial directory data (first 24 active employees)
  const { data: initialEmployees } = await supabase
    .from('employees')
    .select('id, full_name, designation, role, department, photo_url, employee_code, email, phone, blood_group, is_active')
    .eq('is_active', true)
    .order('full_name')
    .range(0, 23);

  return <DirectoryClient initialEmployees={initialEmployees || []} />;
}
