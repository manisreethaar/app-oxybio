'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    
    const fetchUser = async () => {
      try {
        setError(null);

        // Helper: creates a FRESH timeout per call so the timer never carries over
        const withTimeout = (promise, ms = 15000) =>
          Promise.race([
            promise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Connection timed out. Please check your internet.")), ms)
            )
          ]);

        const { data: { user }, error: authErr } = await withTimeout(supabase.auth.getUser());
        if (authErr) throw authErr;

        if (user && isMounted) {
          setUser(user);
          const { data: profile, error: profileErr } = await withTimeout(
            supabase.from('employees').select('*').eq('email', user.email).single()
          );
          if (profileErr) throw profileErr;
          setEmployeeProfile(profile);
        }
      } catch (err) {
        console.error("Auth initialization aborted:", err);
        if (isMounted) setError(err.message || "Failed to connect. Please retry.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          // Fetch profile if it's a new sign-in
          if (event === 'SIGNED_IN' || !employeeProfile) {
             const { data: profile } = await supabase
               .from('employees')
               .select('*')
               .eq('email', session.user.email)
               .single();
             setEmployeeProfile(profile);
          }
        } else {
          setUser(null);
          setEmployeeProfile(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const value = {
    user,
    employeeProfile,
    role: employeeProfile?.role,
    isAdmin: employeeProfile?.role === 'admin',
    isStaff: employeeProfile?.role === 'staff',
    isIntern: employeeProfile?.role === 'intern',
    loading,
    error,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
