'use client';
import {
  createContext, useContext, useEffect,
  useState, useCallback, useMemo, useRef,
} from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { mutate as mutateSWR } from 'swr';
import { can, getPermissionsForRole, isMasterAdmin } from '@/lib/permissions';

const AuthContext = createContext({});

const PROFILE_SELECT =
  'id,full_name,initials,email,role,department,designation,is_active,photo_url,employee_code,phone,address,blood_group,emergency_contact,emergency_contact_name,joined_date,date_of_birth,casual_leave_balance,medical_leave_balance,earned_leave_balance,custom_permissions,base_salary';

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
export const AuthProvider = ({ children, initialSession, initialProfile }) => {
  const supabase      = useMemo(() => createClient(), []);
  const router        = useRouter();
  const fetchingRef   = useRef(false);
  const initializedRef= useRef(false);

  const serverProfile = initialProfile || null;

  // IMPORTANT: the initial state here must match what the server rendered
  // exactly, or React throws a hydration mismatch and discards + redoes the
  // entire tree on every single page load (this was happening app-wide —
  // sessionStorage doesn't exist during SSR, so reading it synchronously
  // here to seed state made the client's first render diverge from the
  // server's). serverProfile is safe because it was computed the same way
  // during SSR. The (possibly fresher) sessionStorage cache is applied in
  // the effect below instead, which only ever runs after hydration.
  const [user,            setUser]            = useState(initialSession?.user || null);
  const [employeeProfile, setEmployeeProfile] = useState(serverProfile);
  const [loading,         setLoading]         = useState(!serverProfile);
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
          if (isMasterAdmin(email)) {
            return { email, role: 'admin', full_name: 'Master Admin', is_active: true };
          }
        }
        return null;
      }

      if (data?.role) data.role = data.role.toLowerCase();
      if (isMasterAdmin(email)) {
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

      // Step 2: If the server already fetched a fresh profile for this exact
      // request (RootLayout), trust it directly — re-fetching the same row
      // again client-side a few milliseconds later was pure redundant load,
      // doubling the Supabase round-trips on every single page load.
      if (serverProfile && serverProfile.email?.toLowerCase() === currentUser.email?.toLowerCase()) {
        setEmployeeProfile(serverProfile);
        writeCache(serverProfile);
        setLoading(false);
        initializedRef.current = true;
        return;
      }

      // Step 3: No fresh server profile available (e.g. client-only mount) —
      // fall back to a possibly-stale session cache so the UI isn't blocked,
      // and revalidate it in the background since it wasn't just fetched.
      const cached = readCache();
      if (cached && cached.email?.toLowerCase() === currentUser.email?.toLowerCase()) {
        setLoading(false);
        initializedRef.current = true;
        fetchProfile(currentUser.email).then(fresh => {
          if (mounted && fresh) {
            setEmployeeProfile(fresh);
            writeCache(fresh);
          }
        });
        return;
      }

      // Step 4: No cache or different user — fetch and block until resolved
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

    // Safety valve — if everything hangs (cold start + cache miss), unblock at 4s
    // Vercel cold starts can take 3s+, so 2s was too aggressive and caused pages
    // to render with loading=false but employeeProfile=null, breaking data fetches.
    const safety = setTimeout(() => { if (mounted) setLoading(false); }, 4000);

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

  // ── Stale-tab recovery ────────────────────────────────────
  // A tab that sits backgrounded (or frozen/bfcache'd) for a while can come
  // back with its Supabase client stuck forever awaiting an internal
  // session/lock promise that never resolves — a known GoTrueClient failure
  // mode under browser tab throttling. Every .from() query awaits
  // getSession() first, so once that's wedged, all data fetching on the tab
  // hangs with no network error for any per-call timeout to catch (the
  // request never even reaches fetch). This is why timeout/retry patches
  // scattered across individual components never fixed it — they wrap the
  // wrong layer. Instead: when the tab becomes visible again after a real
  // absence (or is restored from bfcache), probe getSession() with a hard
  // timeout. Healthy → just revalidate SWR data so it isn't stale. Stuck →
  // the client can't be recovered in place, so reload, which is exactly the
  // "open a new window" path already known to work.
  useEffect(() => {
    let hiddenAt = null;
    const RELOAD_GUARD_KEY = 'oxyo_stale_reload_at';
    const HIDDEN_THRESHOLD_MS = 20000;
    const PROBE_TIMEOUT_MS = 6000;
    const RELOAD_COOLDOWN_MS = 15000;

    const probe = async () => {
      try {
        await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('stuck')), PROBE_TIMEOUT_MS)),
        ]);
        mutateSWR(() => true, undefined, { revalidate: true });
      } catch {
        const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        if (Date.now() - lastReload > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
          window.location.reload();
        }
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_THRESHOLD_MS) {
        probe();
      }
    };

    const onPageShow = (e) => { if (e.persisted) probe(); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [supabase]);

  // ── Sign out ─────────────────────────────────────────────
  const signOut = async () => {
    try {
      clearCache();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Signout timeout')), 2000));
      await Promise.race([supabase.auth.signOut(), timeoutPromise]);
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    } finally {
      setUser(null);
      setEmployeeProfile(null);
    }
  };

  // ── Force-refresh profile (e.g. after role/designation change) ──
  const refreshProfile = useCallback(async () => {
    if (!user?.email) return;
    clearCache();
    const fresh = await fetchProfile(user.email);
    if (fresh) {
      setEmployeeProfile(fresh);
      writeCache(fresh);
    }
  }, [user?.email, fetchProfile]);

  const role = employeeProfile?.role;

  const canDo = useCallback(
    (module, action) => can(role, module, action, employeeProfile?.custom_permissions),
    [role, employeeProfile?.custom_permissions]
  );

  const permissions = useMemo(
    () => (role ? getPermissionsForRole(role, employeeProfile?.custom_permissions) : {}),
    [role, employeeProfile?.custom_permissions]
  );

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = {
    user,
    employeeProfile,
    role,
    isAdmin: role === 'admin' || role === 'ceo' || role === 'cto' || isMasterAdmin(user?.email),
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
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
