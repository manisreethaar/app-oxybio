export const dynamic = 'force-dynamic';
import { createClient } from "@/utils/supabase/server";
import { getRequestUser } from "@/utils/supabase/request-user";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }) {
  const supabase = createClient();
  // Identity already validated by middleware.js (which also gates /admin) —
  // no need to call supabase.auth.getUser() again here.
  const user = getRequestUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("employees")
    .select("role")
    .eq("email", user.email)
    .single();

  if (!['admin', 'ceo', 'cto'].includes(profile?.role)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
