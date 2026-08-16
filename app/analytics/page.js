import { Activity, BarChart2, TrendingUp, Clock, FlaskConical } from 'lucide-react';
import Link from 'next/link';

const CARDS = [
  {
    href: '/analytics/batches',
    icon: Activity,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'Batch Variations',
    desc: 'Compare pH, temperature, and fermentation timelines across multiple batches. Analyze endpoints and yields.',
  },
  {
    href: '/analytics/lab',
    icon: BarChart2,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: 'Lab & Growth Studies',
    desc: 'Analyze Plate Analysis (CFU counts, sterility) and Optical Density (OD) progressions from the Lab Bench.',
  },
  {
    href: '/analytics/growth',
    icon: TrendingUp,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'Growth Studies Analytics',
    desc: 'OD growth curve overlays, study completion rates, strain comparisons, and measurement trends over time.',
  },
  {
    href: '/analytics/stability',
    icon: Clock,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    title: 'Stability / Shelf Life',
    desc: 'pH degradation timelines across storage conditions, study status overview, and shelf life log summaries.',
  },
  {
    href: '/analytics/bioprocess',
    icon: FlaskConical,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'Bioprocess Analytics',
    desc: 'Live kinetics — Specific Growth Rate (μ), Biomass Yield (Yx/s), Acid Productivity (Qp), TA Acid Curves, and real-time process flaw detection.',
  },
];

export default function AnalyticsOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {CARDS.map(card => {
        const Icon = card.icon;
        return (
          <Link
            key={card.href}
            href={card.href}
            className="glass-card rounded-2xl p-6 border border-slate-200/50 hover:shadow-soft transition-all group block hover:border-slate-300"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 ${card.iconBg} ${card.iconColor} rounded-xl flex items-center justify-center`}>
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600 transition-colors">Explore →</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">{card.title}</h2>
            <p className="text-slate-500 text-sm">{card.desc}</p>
          </Link>
        );
      })}
    </div>
  );
}
