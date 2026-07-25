import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── PERF FIX: getUser() validates the JWT cookie locally.
  // Old code used getSession() which made a NETWORK CALL to Supabase Auth
  // on every single page navigation → +200–600ms per click, every time.
  let user = null;
  try {
    const { data: { user: u } } = await supabase.auth.getUser();
    user = u ?? null;
  } catch {
    // Auth service unreachable — fail open. API routes auth independently.
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;

  const protectedPrefixes = [
    '/dashboard', '/leave', '/attendance', '/tasks', '/activity',
    '/batches', '/compliance', '/documents', '/payslips', '/sops',
    '/admin', '/notifications', '/directory', '/formulations',
    '/shelf-life', '/research', '/calendar', '/inventory', '/profile',
    '/capa', '/equipment', '/lab-notebook', '/mispunch',
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
      '/api/attendance', '/api/mispunch', '/api/leave', '/api/auth', '/api/cron'
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip _next/static, images. Note: We removed the 'api' skip here
    // so that middleware CAN process API routes for the GDP check.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
