/* 
  DIAGNOSTIC SCRIPT: auth_check.js
  This will help us find if your Auth ID matches your Employee ID.
*/
import { createClient } from '@/utils/supabase/client';

export default function AuthCheck() {
  const supabase = createClient();

  const runCheck = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    console.log("--- AUTH SYSTEM ---");
    console.log("Your Auth ID:", user?.id);
    console.log("Your Email:", user?.email);

    const { data: profile } = await supabase
      .from('employees')
      .select('id, email, role')
      .eq('email', user?.email)
      .single();

    console.log("--- EMPLOYEE TABLE ---");
    console.log("Profile ID in DB:", profile?.id);
    console.log("Role in DB:", profile?.role);

    if (user?.id !== profile?.id) {
      console.error("CRITICAL MISMATCH FOUND!");
      console.log("Your Login ID does not match your Profile ID. This is why Admin access is blocked.");
    } else {
      console.log("IDs match. Checking RLS or Caching...");
    }
  };

  return (
    <div className="p-10">
      <button onClick={runCheck} className="px-6 py-3 bg-navy text-white rounded-xl">
        Run Deep Diagnostic
      </button>
      <p className="mt-4 text-sm text-slate-500">Check your Browser Console (F12) after clicking.</p>
    </div>
  );
}
