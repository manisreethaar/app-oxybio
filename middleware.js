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

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip _next/static, images, and ALL /api/* routes.
    // API routes authenticate themselves — middleware does not touch them.
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
