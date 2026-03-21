'use client';
import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { can, getPermissionsForRole } from '@/lib/permissions';

const AuthContext = createContext({});

export const AuthProvider = ({ children, initialSession, initialProfile }) => {
  const initialized = useRef(false);
  const [user, setUser] = useState(initialSession?.user || null);
  const [employeeProfile, setEmployeeProfile] = useState(initialProfile || null);
  const [loading, setLoading] = useState(!initialSession);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        // Handle immediate sign out
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          setEmployeeProfile(null);
          setLoading(false);
          initialized.current = true;
          return;
        }

        // Handle session events
        if (session?.user) {
          setUser(session.user);
          
          // Only fetch profile if it's missing or changed
          if (!employeeProfile || employeeProfile.email !== session.user.email || !initialized.current) {
            try {
              const { data: profile } = await supabase
                .from('employees')
                .select('*')
                .eq('email', session.user.email)
                .single();
              if (mounted) setEmployeeProfile(profile || null);
            } catch (err) {
              console.error("Profile sync error:", err);
            }
          }
        }

        if (mounted) {
          setLoading(false);
          initialized.current = true;
        }
      }
    );

    // Initial check in case onAuthStateChange didn't fire immediately
    if (initialSession && !initialized.current) {
      setLoading(false);
      initialized.current = true;
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, initialSession]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("SignOut network fault:", err);
    } finally {
      setUser(null);
      setEmployeeProfile(null);
      router.push('/login');
    }
  };

  const role = employeeProfile?.role;

  const canDo = useCallback(
    (module, action) => can(role, module, action),
    [role]
  );

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
    canDo,
    permissions,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
