import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ClientLayout from "@/components/layout/ClientLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "OxyOS Platform",
  description: "Internal operations for Oxygen Bioinnovations",
  manifest: "/manifest.json",
  themeColor: "#1F3A5F",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OxyOS",
  },
};

import { createClient } from "@/utils/supabase/server";

export default async function RootLayout({ children }) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  let profile = null;
  if (session?.user) {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('email', session.user.email)
      .single();
    profile = data;
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider initialSession={session} initialProfile={profile}>
          <ClientLayout>
            {children}
          </ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
