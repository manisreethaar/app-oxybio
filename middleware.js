import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Supabase signs session JWTs with a project-wide HS256 secret (Project
// Settings -> API -> JWT Settings -> JWT Secret in the dashboard). Verifying
// the signature locally with that secret is cryptographically equivalent to
// asking Supabase's Auth server "is this token real and unexpired" -- but
// it's pure math, no network round-trip. That gets getUser()'s correctness
// (a forged/expired token is rejected) at getSession()'s speed. The one gap
// vs. a live network call: an admin deactivating a user takes effect on
// that user's next token refresh, not instantly -- an accepted, standard
// JWT tradeoff, and strictly better than the getSession()-only approach
// this replaces, which had that same gap with no signature check at all.
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null;

// Errors that mean "this token is genuinely invalid" -- reject as
// unauthenticated. Anything else (malformed session shape, a jose library
// hiccup) falls through to the authoritative network call instead, so a
// verification-path bug can't silently lock users out.
const INVALID_TOKEN_CODES = new Set([
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_INVALID',
]);

async function resolveUser(supabase) {
  if (JWT_SECRET) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const { payload } = await jwtVerify(session.access_token, JWT_SECRET, { algorithms: ['HS256'] });
      return { id: payload.sub, email: payload.email ?? '' };
    } catch (err) {
      if (INVALID_TOKEN_CODES.has(err?.code)) return null;
      // Fall through to getUser() below for anything unexpected.
    }
  }
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? '' } : null;
}

export async function middleware(request) {
  // ── PERF FIX: this is the ONLY place in the app that should validate the
  // session. Once we know who the user is, we forward it downstream via
  // trusted request headers (x-user-id / x-user-email) so the root layout,
  // admin/analytics layouts, and pages like inventory/directory/activity no
  // longer each make their own redundant supabase.auth.getUser() call —
  // that was 3-5 serial Supabase Auth round-trips stacked on every single
  // navigation, which is what made modules feel like they "never load"
  // until a manual refresh happened to land after the chain resolved.
  const requestHeaders = new Headers(request.headers);
  // Never trust client-supplied identity headers — strip them first so they
  // can only be set below, by this middleware, after JWT validation.
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-email');

  const cookiesToApply = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToApply.push(...cookiesToSet);
        },
      },
    }
  );

  // See resolveUser() above: verifies the JWT signature locally (fast, no
  // network call) when SUPABASE_JWT_SECRET is configured, falling back to
  // the authoritative supabase.auth.getUser() network call otherwise.
  let user = null;
  try {
    user = await resolveUser(supabase);
  } catch {
    // Auth service unreachable — fail open. API routes auth independently.
    const resp = NextResponse.next({ request: { headers: requestHeaders } });
    cookiesToApply.forEach(({ name, value, options }) => resp.cookies.set(name, value, options));
    return resp;
  }

  if (user) {
    requestHeaders.set('x-user-id', user.id);
    requestHeaders.set('x-user-email', user.email ?? '');
  }

  const { pathname } = request.nextUrl;

  const protectedPrefixes = [
    '/dashboard', '/leave', '/attendance', '/tasks', '/activity',
    '/batches', '/compliance', '/documents', '/payslips', '/sops',
    '/admin', '/notifications', '/directory', '/formulations',
    '/shelf-life', '/research', '/calendar', '/inventory', '/profile',
    '/capa', '/equipment', '/lab-notebook', '/mispunch',
    '/analytics', '/scada', '/shift-handover', '/environmental-monitoring',
    '/bioprocess', '/growth-studies', '/lab-bench', '/messages',
  ];

  const isProtected = protectedPrefixes.some(p => pathname.startsWith(p));
  const isAuthRoute  = pathname === '/login';
  const isApiRoute   = pathname.startsWith('/api/');

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = user ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  // ── ALCOA++ GDP Attendance Enforcement ─────────────────────────────────
  // Prevent data entry (POST, PUT, PATCH, DELETE) if the user is not checked in today.
  // The CEO is exempt from this rule.
  if (user && isApiRoute && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const exemptedApiPrefixes = [
      '/api/attendance', '/api/mispunch', '/api/leave', '/api/auth', '/api/cron', '/api/push'
    ];
    const isExempted = exemptedApiPrefixes.some(p => pathname.startsWith(p));
    
    if (!isExempted) {
      try {
        const { data: emp } = await supabase
          .from('employees')
          .select('id, role')
          .eq('email', user.email)
          .single();
          
        if (emp && emp.role !== 'ceo') {
          // IST Timezone date
          const todayStr = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
          
          const { data: attendance } = await supabase
            .from('attendance_log')
            .select('id')
            .eq('employee_id', emp.id)
            .eq('date', todayStr)
            .maybeSingle();
            
          if (!attendance) {
            return NextResponse.json({ 
              error: 'ALCOA++ GDP Violation: You must be checked in today to enter or modify data. Please go to the Attendance module and complete your daily check-in. If you forgot to check out yesterday and your hours were reset, you must first apply for a mispunch to generate today\'s attendance record.',
              gdp_violation: true
            }, { status: 403 });
          }
        }
      } catch (err) {
        console.error('[Middleware] GDP Check Error:', err);
      }
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = {
  matcher: [
    // Skip _next/static, images. Note: We removed the 'api' skip here
    // so that middleware CAN process API routes for the GDP check.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
