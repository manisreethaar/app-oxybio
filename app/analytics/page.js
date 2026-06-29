'use client';
import { Activity, FlaskConical, BarChart2 } from 'lucide-react';
import Link from 'next/link';

export default function AnalyticsOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Link href="/analytics/batches" className="glass-card rounded-2xl p-6 border border-slate-200/50 hover:shadow-soft transition-all group block">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Batch Variations</h2>
        <p className="text-slate-500 text-sm">Compare pH, Temperature, and fermentation timelines across multiple batches. Analyze endpoints and yields.</p>
      </Link>

      <Link href="/analytics/lab" className="glass-card rounded-2xl p-6 border border-slate-200/50 hover:shadow-soft transition-all group block">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
            <FlaskConical className="w-6 h-6" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Lab & Growth Studies</h2>
        <p className="text-slate-500 text-sm">Analyze Plate Analysis (CFU counts, sterility) and Optical Density (OD) progressions from the Lab Bench.</p>
      </Link>
    </div>
  );
}
