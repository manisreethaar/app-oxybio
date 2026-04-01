'use client';
import {
  createContext, useContext, useEffect,
  useState, useCallback, useMemo, useRef,
} from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { can, getPermissionsForRole } from '@/lib/permissions';

const AuthContext = createContext({});

const PROFILE_SELECT =
  'id,full_name,email,role,department,designation,is_active,photo_url,employee_code,phone,address,blood_group,emergency_contact,emergency_contact_name,joined_date,date_of_birth,casual_leave_balance,medical_leave_balance,earned_leave_balance';

const CACHE_KEY = 'oxyo_profile_v2';

// ── Helpers ──────────────────────────────────────────────────
function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeCache(profile) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(profile)); } catch {}
}
function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

// ─────────────────────────────────────────────────────────────
export const AuthProvider = ({ children, initialSession }) => {
  const supabase      = createClient(); // singleton — no useMemo needed
  const router        = useRouter();
  const fetchingRef   = useRef(false);
  const initializedRef= useRef(false);

  // Restore profile from cache SYNCHRONOUSLY — no loading spinner on warm sessions
  const cachedProfile = readCache();

  const [user,            setUser]            = useState(initialSession?.user || null);
  const [employeeProfile, setEmployeeProfile] = useState(cachedProfile);
  // If we have a cached profile, start as NOT loading → page renders immediately
  const [loading,         setLoading]         = useState(!cachedProfile);
  const [sessionExpired,  setSessionExpired]  = useState(false);

  // ── Profile fetcher ──────────────────────────────────────
  const fetchProfile = useCallback(async (email) => {
    if (!email || fetchingRef.current) return null;
    fetchingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('employees')
        .select(PROFILE_SELECT)
        .ilike('email', email)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`[OxyOS] No employee profile for ${email}`);
        }
        return null;
      }

      if (data?.role) data.role = data.role.toLowerCase();
      if (email === 'manisreethaar@gmail.com') {
        if (!data) return { email, role: 'admin', full_name: 'Master Admin', is_active: true };
        data.role = 'admin';
      }
      return data;
    } finally {
      fetchingRef.current = false;
    }
  }, [supabase]);

  // ── Init effect ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Step 1: Get the current user (uses local JWT — no network call)
      let currentUser = initialSession?.user || null;
      if (!currentUser) {
        const { data: { user: u } } = await supabase.auth.getUser();
        currentUser = u;
      }

      if (!mounted) return;

      if (!currentUser) {
        // No session at all → clear everything
        clearCache();
        setUser(null);
        setEmployeeProfile(null);
        setLoading(false);
        initializedRef.current = true;
        return;
      }

      setUser(currentUser);

      // Step 2: If we already showed cached data, revalidate silently in background
      const cached = readCache();
      if (cached && cached.email?.toLowerCase() === currentUser.email?.toLowerCase()) {
        // Already rendered with cache — just confirm in background
        setLoading(false);
        initializedRef.current = true;
        // Background revalidation
        fetchProfile(currentUser.email).then(fresh => {
          if (mounted && fresh) {
            setEmployeeProfile(fresh);
            writeCache(fresh);
          }
        });
        return;
      }

      // Step 3: No cache or different user — fetch and block until resolved
      const profile = await fetchProfile(currentUser.email);
      if (mounted) {
        if (profile) {
          setEmployeeProfile(profile);
          writeCache(profile);
        }
        setLoading(false);
        initializedRef.current = true;
      }
    };

    // Safety valve — if everything hangs (cold start + cache miss), unblock at 6s
    const safety = setTimeout(() => { if (mounted) setLoading(false); }, 6000);

    init();

    // Auth state changes (sign in / sign out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        clearCache();
        if (initializedRef.current && user) setSessionExpired(true);
        setUser(null);
        setEmployeeProfile(null);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        const profile = await fetchProfile(session.user.email);
        if (mounted && profile) {
          setEmployeeProfile(profile);
          writeCache(profile);
        }
        if (mounted) setLoading(false);
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user); // token refreshed — no profile re-fetch needed
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // ── Sign out ─────────────────────────────────────────────
  const signOut = async () => {
    try {
      clearCache();
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    } catch {
      if (typeof window !== 'undefined') window.location.href = '/login';
    } finally {
      setUser(null);
      setEmployeeProfile(null);
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

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = {
    user,
    employeeProfile,
    role,
    isAdmin: role === 'admin' || role === 'ceo' || role === 'cto' || user?.email === 'manisreethaar@gmail.com',
    isResearchFellow: role === 'research_fellow',
    isScientist: role === 'scientist',
    isIntern: role === 'intern' || role === 'research_intern',
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
