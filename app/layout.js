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

export default async function RootLayout({ children }) {
  const supabase = createClient();

  // FIXED: Only fetch session here — NOT the employee profile.
  // Profile is fetched ONCE inside AuthContext and cached there.
  // This prevents two DB calls on every single page navigation.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider initialSession={session}>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
