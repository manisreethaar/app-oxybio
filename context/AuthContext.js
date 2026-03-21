'use client';
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (session?.user) {
          setUser(session.user);
          const { data: profile, error: profileError } = await supabase
            .from('employees')
            .select('*')
            .eq('email', session.user.email)
            .single();
            
          if (profileError && profileError.code !== 'PGRST116') {
            console.warn('Could not fetch profile:', profileError);
          }
          if (mounted) setEmployeeProfile(profile || null);
        } else {
          if (mounted) {
            setUser(null);
            setEmployeeProfile(null);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setUser(null);
          setEmployeeProfile(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setEmployeeProfile(null);
          setLoading(false);
          return;
        }

        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
          try {
            setUser(session.user);
            const { data: profile } = await supabase
              .from('employees')
              .select('*')
              .eq('email', session.user.email)
              .single();
            if (mounted) setEmployeeProfile(profile || null);
          } catch (error) {
            console.error('Session update error:', error);
          } finally {
            if (mounted) setLoading(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
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

  // Memoized: stable reference prevents infinite re-renders in child useEffect dependency arrays
  const canDo = useCallback(
    (module, action) => can(role, module, action),
    [role]
  );

  // Memoized: only recomputes when role changes
  const permissions = useMemo(
    () => role ? getPermissionsForRole(role) : {},
    [role]
  );

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
