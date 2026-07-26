import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import DirectoryClient from './DirectoryClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Directory - OxyOS' };

export default async function DirectoryPage() {
  const supabase = createClient();
  // Identity already validated by middleware.js (which also gates
  // /directory) — no need to call supabase.auth.getUser() again here.
  const user = getRequestUser();

  if (!user) {
    redirect('/login');
  }

  // Pre-fetch initial directory data (first 24 active employees)
  const { data: initialEmployees } = await supabase
    .from('employees')
    .select('id, full_name, designation, role, department, photo_url, employee_code, email, phone, blood_group, is_active, date_of_birth, joined_date, address, emergency_contact, emergency_contact_name, base_salary, custom_permissions')
    .eq('is_active', true)
    .order('full_name')
    .range(0, 23);

  return <DirectoryClient initialEmployees={initialEmployees || []} />;
}
