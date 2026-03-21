'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    
    const fetchUser = async () => {
      try {
        // Implement a strict 8-second timeout on the Supabase network request
        // so the app NEVER freezes if the connection stutters.
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Auth request timeout")), 8000)
        );
        
        const { data: { user }, error } = await Promise.race([
          supabase.auth.getUser(),
          timeoutPromise
        ]);
        
        if (error) throw error;
        
        if (user && isMounted) {
          setUser(user);
          const { data: profile } = await Promise.race([
            supabase.from('employees').select('*').eq('email', user.email).single(),
            timeoutPromise
          ]);
          setEmployeeProfile(profile);
        }
      } catch (err) {
        console.error("Auth initialization securely aborted:", err);
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
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
