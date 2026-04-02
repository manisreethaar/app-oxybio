import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ClientLayout from "@/components/layout/ClientLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "OxyOS Platform",
  description: "Internal operations for Oxygen Bioinnovations",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OxyOS",
  },
};

export const viewport = {
  themeColor: "#1F3A5F",
};

import { createClient } from "@/utils/supabase/server";

const PROFILE_SELECT = 'id,full_name,email,role,department,designation,is_active,photo_url,employee_code,phone,address,blood_group,emergency_contact,emergency_contact_name,joined_date,date_of_birth,casual_leave_balance,medical_leave_balance,earned_leave_balance';

export default async function RootLayout({ children }) {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  let initialProfile = null;
  if (session?.user?.email) {
    const { data: profile } = await supabase
      .from('employees')
      .select(PROFILE_SELECT)
      .ilike('email', session.user.email)
      .single();
    initialProfile = profile;
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider initialSession={session} initialProfile={initialProfile}>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
