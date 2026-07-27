import { headers } from 'next/headers';

export function getApiUser() {
  const h = headers();
  const id = h.get('x-user-id');
  const email = h.get('x-user-email');
  if (!id) return null; // Email might be empty, so don't check !email strictly if it can be empty, but id must exist.
  return { id, email: email || '' };
}

export async function getApiUserOrFallback(supabase) {
  const fast = getApiUser();
  if (fast) return fast;
  
  // Fallback with a 4 second timeout to prevent infinite hanging
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 4000));
  
  try {
    const { data: { user } } = await Promise.race([
      supabase.auth.getUser(),
      timeout
    ]);
    if (!user) return null;
    return { id: user.id, email: user.email ?? '' };
  } catch (err) {
    console.error('getApiUserOrFallback timeout/error:', err);
    return null;
  }
}
