import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
