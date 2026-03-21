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
    // onAuthStateChange is the ONLY source of truth.
    // It fires immediately on mount with the current session (INITIAL_SESSION event),
    // so there is no need for a separate getUser() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          // Fetch the employee profile from the DB
          const { data: profile } = await supabase
            .from('employees')
            .select('*')
            .eq('email', session.user.email)
            .single();
          setEmployeeProfile(profile || null);
        } else {
          setUser(null);
          setEmployeeProfile(null);
        }
        // Always stop loading once we get any auth event
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setEmployeeProfile(null);
    router.push('/login');
  };

  const value = {
    user,
    employeeProfile,
    role: employeeProfile?.role,
    isAdmin: employeeProfile?.role === 'admin',
    isStaff: employeeProfile?.role === 'staff',
    isIntern: employeeProfile?.role === 'intern',
    loading,
    error: null,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
