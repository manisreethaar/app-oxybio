import { redirect } from 'next/navigation';

export default function SopsPage() {
  redirect('/documents?tab=sops');
}
