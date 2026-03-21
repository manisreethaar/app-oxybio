'use client';
import { useAuth } from '@/context/AuthContext';
import { BellRing, CheckSquare } from 'lucide-react';

export default function NotificationsPage() {
  const { employeeProfile } = useAuth();

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Notifications Log</h1>
          <p className="text-slate-500 mt-1 font-medium">Recent system alerts and push notifications.</p>
        </div>
      </div>

      <div className="glass-card rounded-[2rem] p-12 text-center flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-24 h-24 bg-teal-50 rounded-full flex flex-col items-center justify-center mb-6 border border-teal-100 shadow-sm relative text-teal-600">
          <BellRing className="w-10 h-10 mb-1" />
          <span className="absolute top-4 right-4 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></span>
        </div>
        
        <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">You&apos;re All Caught Up</h2>
        <p className="text-slate-500 font-medium max-w-sm mb-8 leading-relaxed">
          Critical alerts (like expiring compliance documents and high-priority task assignments) are actively routed straight to your mobile device&apos;s lock screen via Web Push.
        </p>

        <div className="flex items-center gap-2 text-sm font-bold text-slate-400 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
          <CheckSquare className="w-4 h-4" /> System monitoring active
        </div>
      </div>
    </div>
  );
}
