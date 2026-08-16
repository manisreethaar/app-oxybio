import { createClient } from '@/utils/supabase/server';
import DocumentsClient from './DocumentsClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DocumentsPage() {
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();

  // 2. Fetch Data (0ms latency Server-Side)
  // Fetch active documents (not archived)
  let query = supabase.from('documents')
    .select('*, employees!documents_uploaded_by_fkey(full_name, initials), approver:employees!documents_approved_by_fkey(full_name, initials)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  // If not high level role, only see approved docs or docs they uploaded themselves
  // For simplicity, we filter approved docs or pending docs uploaded by them on the client,
  // but let's fetch all permitted by RLS here.
  
  const { data: documentsRes } = await query;
  const initialDocuments = documentsRes || [];

  return <DocumentsClient initialDocuments={initialDocuments} currentUserRole={emp?.role} currentUserId={emp?.id} />;
}
