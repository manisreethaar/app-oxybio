import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ClientLayout from "@/components/layout/ClientLayout";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  display: "swap",
});

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

// Next.js 14 generates the <meta name="viewport"> tag from this export.
// Do NOT add a manual <meta> tag in <head> — it causes duplicates and hydration mismatches.
export const viewport = {
  themeColor: "#1F3A5F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { createClient } from "@/utils/supabase/server";

const PROFILE_SELECT = 'id,full_name,email,role,department,designation,is_active,photo_url,employee_code,phone,address,blood_group,emergency_contact,emergency_contact_name,joined_date,date_of_birth,casual_leave_balance,medical_leave_balance,earned_leave_balance';

export default async function RootLayout({ children }) {
  const supabase = createClient();

  // FIX: Use getUser() instead of getSession().
  // getSession() reads from local storage without validating the JWT,
  // so it can return stale/expired tokens. getUser() validates against
  // the Supabase Auth server and is the recommended approach.
  let initialSession = null;
  let initialProfile = null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (!error && user) {
      // Build a minimal session object for AuthContext compatibility
      initialSession = { user };

      const { data: profile } = await supabase
        .from('employees')
        .select(PROFILE_SELECT)
        .ilike('email', user.email)
        .single();
      initialProfile = profile;
    }
  } catch (e) {
    // Auth service unreachable on cold start — fail gracefully.
    // AuthContext will re-attempt on the client side.
    console.warn('[RootLayout] Server auth check failed:', e?.message);
  }

  return (
    <html lang="en">
      {/* No manual <head> needed — Next.js generates viewport meta from the export above */}
      <body className={geistSans.className}>
        <AuthProvider initialSession={initialSession} initialProfile={initialProfile}>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
