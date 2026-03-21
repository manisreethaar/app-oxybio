'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BellRing, X, Loader2 } from 'lucide-react';

export default function PushManager() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) {
            setSubscribed(true);
            saveSubscription(sub); // keep sync with DB
          } else if (Notification.permission !== 'denied') {
            setShowBanner(true);
          }
        });
      });
    }
  }, [user]);

  const saveSubscription = async (subscription) => {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription })
    });
  };

  const subscribeUser = async () => {
    try {
      setLoading(true);
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        });
        await saveSubscription(sub);
        setSubscribed(true);
        setShowBanner(false);
      } else {
        setShowBanner(false);
      }
    } catch (err) {
      console.error("Failed to subscribe", err);
    } finally {
      setLoading(false);
    }
  };

  if (!showBanner || subscribed || !user) return null;

  return (
    <div className="bg-gradient-to-r from-teal-800 to-teal-700 text-white px-4 py-3 shadow-md flex flex-col sm:flex-row items-center justify-between z-40 relative">
      <div className="flex items-center mb-3 sm:mb-0">
        <div className="bg-amber-300 p-2 rounded-full mr-3 shadow-inner hidden sm:block">
          <BellRing className="w-5 h-5 text-teal-900 animate-pulse" />
        </div>
        <div>
          <h4 className="font-bold text-sm">Enable Native Notifications</h4>
          <p className="text-teal-100 text-xs mt-0.5 max-w-xl">Get instant lock-screen alerts when you are assigned a new protocol or task.</p>
        </div>
      </div>
      <div className="flex items-center space-x-3 shrink-0">
        <button onClick={subscribeUser} disabled={loading} className="bg-white text-teal-900 font-bold px-4 py-2 rounded-lg text-sm hover:bg-gray-100 shadow-sm transition-colors flex items-center">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : "Enable Alerts"}
        </button>
        <button onClick={() => setShowBanner(false)} className="text-teal-200 hover:text-white p-2 rounded-full hover:bg-teal-600 transition-colors"><X className="w-5 h-5" /></button>
      </div>
    </div>
  );
}
