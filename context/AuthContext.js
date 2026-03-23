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
  const [loading, setLoading] = useState(!initialSession || !initialProfile);
  // FIX #10: Track session expiry separately so UI can show a toast
  const [sessionExpired, setSessionExpired] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        if (event === 'SIGNED_OUT' || !session) {
          // If there was a previous user but this isn't a manual sign-out,
          // mark session as expired so the UI can notify the user
          if (initialized.current && user) {
            setSessionExpired(true);
          }
          setUser(null);
          setEmployeeProfile(null);
          setLoading(false);
          initialized.current = true;
          return;
        }

        if (session?.user) {
          setUser(session.user);
          // Only fetch if we don't already have a valid profile from SSR/init
          if (!employeeProfile && !initialized.current) {
            try {
              const { data: profile } = await supabase
                .from('employees')
                .select('*')
                .eq('email', session.user.email)
                .single();
                
              if (mounted) {
                setEmployeeProfile(profile || null);
              }
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

    if (initialSession && !initialized.current) {
      setLoading(false);
      initialized.current = true;
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, initialSession]);

  // Root-Cause Fix: Real-time Profile Synchronization (CDC)
  useEffect(() => {
    if (!user?.email) return;

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'employees', 
          filter: `email=eq.${user.email}` 
        },
        (payload) => {
          setEmployeeProfile(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.email, supabase]);

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

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = {
    user,
    employeeProfile,
    role,
    isAdmin: role === 'admin',
    isResearchFellow: role === 'research_fellow',
    isScientist: role === 'scientist',
    isIntern: role === 'intern',
    loading,
    sessionExpired,
    clearSessionExpired,
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
