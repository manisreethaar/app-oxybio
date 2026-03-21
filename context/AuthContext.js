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
    
    // SAFETY TIMEOUT: Never let the app buffer for more than 5 seconds
    const timeoutGuard = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth initialization timed out - forcing loading state to false");
        setLoading(false);
      }
    }, 5000);

    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Session fetch error:", sessionError);
          if (mounted) setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          const { data: profile, error: profileError } = await supabase
            .from('employees')
            .select('*')
            .eq('email', session.user.email)
            .single();
            
          if (profileError && profileError.code !== 'PGRST116') {
             console.warn('Profile fetch error:', profileError.message);
          }
          if (mounted) setEmployeeProfile(profile || null);
        } else {
          if (mounted) {
            setUser(null);
            setEmployeeProfile(null);
          }
        }
      } catch (error) {
        console.error('Critical Auth error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          clearTimeout(timeoutGuard);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          setEmployeeProfile(null);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          const { data: profile } = await supabase
            .from('employees')
            .select('*')
            .eq('email', session.user.email)
            .single();
          if (mounted) setEmployeeProfile(profile || null);
          if (mounted) setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeoutGuard);
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
