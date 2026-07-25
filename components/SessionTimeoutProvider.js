'use client';
import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';

export default function SessionTimeoutProvider({ children, timeoutMinutes = 30 }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const timeoutId = useRef(null);
  
  const resetTimeout = useCallback(() => {
    if (timeoutId.current) clearTimeout(timeoutId.current);
    
    // Only set timeout if user is authenticated and not already on the login page
    if (user && pathname !== '/login') {
      timeoutId.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        toast.warn(`Session locked after ${timeoutMinutes} minutes of inactivity for security.`);
        router.push('/login');
      }, timeoutMinutes * 60 * 1000);
    }
  }, [user, pathname, router, timeoutMinutes]);

  useEffect(() => {
    // List of events that reset the inactivity timer
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    // Initialize
    resetTimeout();
    
    // Attach listeners
    events.forEach(evt => document.addEventListener(evt, resetTimeout));
    
    // Cleanup
    return () => {
      events.forEach(evt => document.removeEventListener(evt, resetTimeout));
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [resetTimeout]);

  return <>{children}</>;
}
