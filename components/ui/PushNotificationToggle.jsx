'use client';
import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationToggle() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    } else {
      setIsLoading(false);
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (err) {
      console.error('Error checking push subscription:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    if (isLoading) return;

    // Preserve user gesture for Safari by calling requestPermission immediately
    if (!isSubscribed) {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error("Permission not granted for notifications.");
          return;
        }
      } catch (err) {
        toast.error("Failed to request permission.");
        return;
      }
    }

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
        
        // Tell server to remove subscription
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: null }),
        });
        
        setIsSubscribed(false);
        toast.info("Push notifications disabled.");
      } else {
        const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicVapidKey) {
          throw new Error('VAPID key not configured');
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        });

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        });

        if (!res.ok) throw new Error("Server rejected subscription");
        
        setIsSubscribed(true);
        toast.success("Push notifications enabled! You'll receive native OS alerts.");
      }
    } catch (err) {
      console.error("Push toggle error:", err);
      toast.error("Failed to toggle notifications: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
        Native push notifications not supported by this browser.
      </div>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
        isSubscribed 
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isSubscribed ? (
        <Bell className="w-4 h-4" />
      ) : (
        <BellOff className="w-4 h-4" />
      )}
      {isLoading 
        ? 'Updating...' 
        : isSubscribed 
          ? 'Native Notifications ON' 
          : 'Enable Native Notifications'
      }
    </button>
  );
}
