'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { can, getPermissionsForRole } from '@/lib/permissions';

const AuthContext = createContext({});

// FIXED: Only select columns actually needed for auth and role checks.
// Avoids pulling large fields (face data, etc.) on every session load.
const PROFILE_SELECT =
  'id, full_name, email, role, department, designation, is_active, photo_url';

export const AuthProvider = ({ children, initialSession }) => {
  const initialized = useRef(false);
  const profileFetching = useRef(false); // FIXED: prevents duplicate fetches

  const [user, setUser] = useState(initialSession?.user || null);
  const [employeeProfile, setEmployeeProfile] = useState(null);

  // FIXED: If we have a session from SSR, don't show loading spinner —
  // show the page immediately and let profile load in background.
  const [loading, setLoading] = useState(!initialSession);
  const [sessionExpired, setSessionExpired] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // FIXED: Single profile fetch function used everywhere — no duplication.
  // Uses ref guard to ensure it never runs twice simultaneously.
  const fetchProfile = useCallback(
    async (email) => {
      if (!email || profileFetching.current) return null;
      profileFetching.current = true;
      try {
        const { data, error } = await supabase
          .from('employees')
          .select(PROFILE_SELECT)
          .eq('email', email)
          .single();
        if (error) {
          console.error('Profile fetch error:', error.message);
          return null;
        }
        return data;
      } finally {
        profileFetching.current = false;
      }
    },
    [supabase]
  );

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // FIXED: If SSR already gave us a session, skip the getSession() call.
      // Only call getSession() if we have no session from SSR.
      let currentUser = initialSession?.user || null;

      if (!currentUser) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        currentUser = session?.user || null;
      }

      if (!mounted) return;

      if (currentUser) {
        setUser(currentUser);
        // Fetch profile — loading stays true until profile resolves
        const profile = await fetchProfile(currentUser.email);
        if (mounted && profile) setEmployeeProfile(profile);
      }

      // Only set loading=false AFTER profile fetch attempt — prevents blank page flicker
      if (mounted) {
        setLoading(false);
        initialized.current = true;
      }
    };

    // Safety timeout — if auth somehow hangs, unblock the UI after 8s
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 8000);

    init();

    // FIXED: onAuthStateChange only handles actual auth events (login/logout).
    // It no longer duplicates the profile fetch that init() already handles.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        if (initialized.current && user) setSessionExpired(true);
        setUser(null);
        setEmployeeProfile(null);
        setLoading(false);
        initialized.current = true;
        return;
      }

      // FIXED: Only fetch profile on actual sign-in events, not on every
      // TOKEN_REFRESHED or INITIAL_SESSION event which fire constantly.
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        const profile = await fetchProfile(session.user.email);
        if (mounted && profile) setEmployeeProfile(profile);
        if (mounted) {
          setLoading(false);
          initialized.current = true;
        }
      }

      // Handle token refresh silently — just update user, don't re-fetch profile
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Real-time profile sync — only subscribes after profile is loaded,
  // not on initial mount. Reduces startup connection overhead.
  useEffect(() => {
    if (!user?.id || !employeeProfile) return;

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'employees',
          filter: `email=eq.${user.email}`,
        },
        (payload) => {
          setEmployeeProfile(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email, employeeProfile, supabase]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('SignOut error:', err);
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
    () => (role ? getPermissionsForRole(role) : {}),
    [role]
  );

  const clearSessionExpired = useCallback(
    () => setSessionExpired(false),
    []
  );

  const value = {
    user,
    employeeProfile,
    role,
    isAdmin: ['admin', 'ceo', 'cto'].includes(role),
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
