'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BellRing, X, Loader2, Smartphone } from 'lucide-react';

// Converts a base64url VAPID public key to a Uint8Array.
// atob() requires standard base64 with padding — VAPID keys are base64url without padding.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export default function PushManager() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    const checkIOS = () => {
      const ua = navigator.userAgent;
      return /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    };
    setIsIOS(checkIOS());

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        if (!isMounted) return;
        reg.pushManager.getSubscription().then(async sub => {
          if (!isMounted) return;
          if (sub) {
            setSubscribed(true);
            const sessionKey = `push_saved_${user.id}`;
            if (!sessionStorage.getItem(sessionKey)) {
              const ok = await saveSubscription(sub, reg);
              if (ok) sessionStorage.setItem(sessionKey, '1');
            }
          } else if (Notification.permission === 'granted') {
            // Permission already granted but no active subscription (e.g. after SW update)
            // Auto-resubscribe silently — no banner needed
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (vapidKey) {
              try {
                const applicationServerKey = urlBase64ToUint8Array(vapidKey);
                const newSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
                const ok = await saveSubscription(newSub, reg);
                if (ok) {
                  sessionStorage.setItem(`push_saved_${user.id}`, '1');
                  setSubscribed(true);
                }
              } catch (e) {
                console.warn('[PushManager] Silent resubscribe failed:', e);
                setShowBanner(true);
              }
            }
          } else if (Notification.permission !== 'denied') {
            setShowBanner(true);
          }
        }).catch(err => {
          console.error('Error checking push subscription:', err);
        });
      }).catch(err => {
        console.error('Service worker not ready:', err);
      });
    } else if (typeof window !== 'undefined' && !('serviceWorker' in navigator)) {
      setShowBanner(true);
    }
    return () => { isMounted = false; };
  }, [user]);

  // Returns true on success. If the server reports the subscription is invalid
  // (4xx other than auth errors), also unsubscribes the browser so the user
  // gets re-prompted rather than silently failing forever.
  const saveSubscription = async (subscription, reg) => {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription })
      });
      if (res.ok) return true;
      if (res.status === 401) return false; // not logged in yet, skip silently
      // Any other server error means the subscription is rejected — clean up browser side
      console.warn('[PushManager] Server rejected subscription, unsubscribing browser:', res.status);
      if (reg) {
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
      }
      setSubscribed(false);
      setShowBanner(Notification.permission !== 'denied');
      return false;
    } catch (err) {
      console.error('Failed to save subscription:', err);
      return false;
    }
  };

  const subscribeUser = async () => {
    try {
      setLoading(true);
      setError(null);

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setError('Push notifications not configured. Contact administrator.');
        setLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        // urlBase64ToUint8Array handles the missing padding that atob() requires
        const applicationServerKey = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        const ok = await saveSubscription(sub, reg);
        if (ok) {
          const sessionKey = `push_saved_${user?.id}`;
          sessionStorage.setItem(sessionKey, '1');
          setSubscribed(true);
          setShowBanner(false);
        }
      } else if (permission === 'denied') {
        setShowBanner(false);
      }
    } catch (err) {
      console.error('Failed to subscribe to push notifications:', err);
      setError('Failed to enable notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!showBanner || subscribed || !user) return null;

  return (
    <div className="bg-gradient-to-r from-slate-900 to-navy text-white px-4 py-3 shadow-md flex flex-col sm:flex-row items-center justify-center sm:justify-between z-40 relative">
      <div className="flex items-center mb-3 sm:mb-0">
        <div className="bg-amber-100 p-2 rounded-full mr-3 shadow-inner hidden sm:block border border-amber-200">
          {isIOS ? (
            <Smartphone className="w-5 h-5 text-amber-700" />
          ) : (
            <BellRing className="w-5 h-5 text-amber-700 animate-pulse" />
          )}
        </div>
        <div>
          <h4 className="font-bold text-sm">
            {isIOS ? 'Install as App for Notifications' : 'Enable Standard Notifications'}
          </h4>
          <p className="text-slate-300 text-xs mt-0.5 max-w-xl">
            {isIOS 
              ? 'Add OxyOS to your home screen to receive push notifications.'
              : 'Get instant alerts when you are assigned a new protocol or task.'}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3 shrink-0">
        {isIOS ? (
          <span className="text-xs text-slate-300 bg-slate-700 px-3 py-2 rounded-lg">
            Add to Home Screen
          </span>
        ) : (
          <>
            <button 
              onClick={subscribeUser} 
              disabled={loading} 
              className="bg-white text-navy font-bold px-4 py-2 rounded-lg text-xs hover:bg-slate-100 shadow-sm transition-colors flex items-center disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : "Enable"}
            </button>
            {error && (
              <span className="text-xs text-red-300 max-w-[150px]" title={error}>
                {error.includes('not configured') ? '⚠️ Config' : '⚠️ Error'}
              </span>
            )}
          </>
        )}
        <button onClick={() => setShowBanner(false)} className="text-slate-400 hover:text-white p-2 rounded-full transition-colors"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
