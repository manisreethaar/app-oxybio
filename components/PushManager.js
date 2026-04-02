'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BellRing, X, Loader2, Smartphone } from 'lucide-react';

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
        reg.pushManager.getSubscription().then(sub => {
          if (!isMounted) return;
          if (sub) {
            setSubscribed(true);
            saveSubscription(sub);
          } else if (Notification.permission !== 'denied') {
            setShowBanner(true);
          }
        }).catch(err => {
          console.error('Error checking subscription:', err);
        });
      }).catch(err => {
        console.error('Service worker not ready:', err);
      });
    } else if (typeof window !== 'undefined' && !('serviceWorker' in navigator)) {
      setShowBanner(true);
    }
    return () => { isMounted = false; };
  }, [user]);

  const saveSubscription = async (subscription) => {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription })
      });
      if (!res.ok) {
        console.error('Failed to save push subscription to server.');
      }
    } catch (err) {
      console.error('Failed to save subscription:', err);
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
        const keyBytes = Uint8Array.from(atob(vapidKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes
        });
        await saveSubscription(sub);
        setSubscribed(true);
        setShowBanner(false);
      } else if (permission === 'denied') {
        setShowBanner(false);
      }
    } catch (err) {
      console.error("Failed to subscribe", err);
      setError('Failed to enable notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!showBanner || subscribed || !user) return null;

  return (
    <div className="bg-gradient-to-r from-gray-900 to-navy text-white px-4 py-3 shadow-md flex flex-col sm:flex-row items-center justify-center sm:justify-between z-40 relative">
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
          <p className="text-gray-300 text-xs mt-0.5 max-w-xl">
            {isIOS 
              ? 'Add OxyOS to your home screen to receive push notifications.'
              : 'Get instant alerts when you are assigned a new protocol or task.'}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3 shrink-0">
        {isIOS ? (
          <span className="text-xs text-gray-300 bg-slate-700 px-3 py-2 rounded-lg">
            Add to Home Screen
          </span>
        ) : (
          <>
            <button 
              onClick={subscribeUser} 
              disabled={loading} 
              className="bg-white text-navy font-bold px-4 py-2 rounded-lg text-xs hover:bg-gray-100 shadow-sm transition-colors flex items-center disabled:opacity-50"
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
        <button onClick={() => setShowBanner(false)} className="text-gray-400 hover:text-white p-2 rounded-full transition-colors"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
