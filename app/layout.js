export const dynamic = 'force-dynamic';
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ClientLayout from "@/components/layout/ClientLayout";
import WebVitals from "@/components/WebVitals";
import Script from "next/script";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
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
import { getRequestUser } from "@/utils/supabase/request-user";

const PROFILE_SELECT = 'id,full_name,email,role,department,designation,is_active,photo_url,employee_code,phone,address,blood_group,emergency_contact,emergency_contact_name,joined_date,date_of_birth,casual_leave_balance,medical_leave_balance,earned_leave_balance';

export default async function RootLayout({ children }) {
  const supabase = createClient();

  // PERF FIX: identity was already validated once in middleware.js (JWT
  // check against Supabase Auth). Re-running supabase.auth.getUser() here
  // was a second network round-trip to Supabase Auth on every navigation,
  // for no reason — trust the header middleware.js set instead. Only fall
  // back to a live check if the header is somehow missing (e.g. a request
  // that didn't pass through middleware).
  let initialSession = null;
  let initialProfile = null;

  try {
    let user = getRequestUser();
    if (!user) {
      const { data: { user: u }, error } = await supabase.auth.getUser();
      if (!error && u) user = { id: u.id, email: u.email };
    }

    if (user) {
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
      <body className={jakarta.className}>
        {/* Service Worker registered as early as possible so push works even when logged out.
            Must be inside <body> — <script> is not a valid direct child of <html>, and having
            it there caused the browser to silently restructure the parsed HTML, which made
            React's hydration disagree with the server output on literally every page load. */}
        <Script
          id="sw-register"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function(err) { console.warn('SW registration failed:', err); });
                });
              }
            `
          }}
        />
        <AuthProvider initialSession={initialSession} initialProfile={initialProfile}>
          <WebVitals />
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
