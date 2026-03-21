'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { can, getPermissionsForRole } from '@/lib/permissions';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // onAuthStateChange is the ONLY source of truth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
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

  const role = employeeProfile?.role;

  // Convenience: check if the current user can perform an action
  // Usage in any component: const { canDo } = useAuth(); if (canDo('tasks', 'approve')) { ... }
  const canDo = (module, action) => can(role, module, action);

  // Full permissions map for the current user (useful for complex UIs)
  const permissions = role ? getPermissionsForRole(role) : {};

  const value = {
    user,
    employeeProfile,
    role,
    isAdmin: role === 'admin',
    isResearchFellow: role === 'research_fellow',
    isScientist: role === 'scientist',
    isIntern: role === 'intern',
    loading,
    error: null,
    signOut,
    canDo,         // ← NEW: granular permission check
    permissions,   // ← NEW: full permissions map for current role
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
