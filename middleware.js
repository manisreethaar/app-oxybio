import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

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

  // getUser() validates the JWT cookie locally.
  // getSession() decodes the local cookie WITHOUT re-verifying it against
  // Supabase Auth -- Supabase's own docs call this out explicitly: never
  // trust getSession() in server-side code (middleware, API routes),
  // because a stale/about-to-expire/tampered token can decode successfully
  // without actually being valid. That's not just a security gap: an
  // intermittently stale local session is exactly the kind of unpredictable,
  // per-request failure that shows up as "sometimes the page has data,
  // sometimes it doesn't" for the same user. getUser()'s network round-trip
  // costs 200-600ms per navigation, but it's the one Supabase says is safe
  // to trust server-side.
  let user = null;
  try {
    const { data: { user: u } } = await supabase.auth.getUser();
    user = u ?? null;
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
