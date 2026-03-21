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
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        const { data: profile } = await supabase
          .from('employees')
          .select('*')
          .eq('email', user.email)
          .single();
        setEmployeeProfile(profile);
      }
      setLoading(false);
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
