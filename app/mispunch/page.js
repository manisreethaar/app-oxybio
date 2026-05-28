import { redirect } from 'next/navigation';

export default function MispunchPage() {
  redirect('/attendance?tab=corrections');
}
