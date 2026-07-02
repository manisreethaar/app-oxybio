'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight } from 'lucide-react';

const ALL_ROUTES = [
  { name: 'Dashboard',              href: '/dashboard',                  category: 'Overview',   keywords: ['home', 'stats', 'overview'] },
  { name: 'Activity Feed',          href: '/activity',                   category: 'Overview',   keywords: ['logs', 'events', 'feed'] },
  { name: 'My Tasks',               href: '/tasks',                      category: 'Overview',   keywords: ['todo', 'checklist', 'work'] },
  { name: 'Lab Bench',              href: '/lab-bench',                  category: 'Lab',        keywords: ['bench', 'workspace', 'board'] },
  { name: 'Batch Production',       href: '/batches',                    category: 'Lab',        keywords: ['batch', 'manufacturing', 'production'] },
  { name: 'Lab Notebook',           href: '/lab-notebook',               category: 'Lab',        keywords: ['notes', 'entries', 'records', 'eln'] },
  { name: 'Incubation Lab',         href: '/research/incubation',        category: 'Lab',        keywords: ['incubator', 'culture', 'ferment'] },
  { name: 'Formulation Library',    href: '/formulations',               category: 'R&D',        keywords: ['recipe', 'formula', 'product', 'ingredient'] },
  { name: 'Cell Bank',              href: '/research/cell-bank',         category: 'R&D',        keywords: ['cells', 'cultures', 'strains', 'microbes'] },
  { name: 'Growth Studies',         href: '/growth-studies',             category: 'R&D',        keywords: ['growth', 'curves', 'kinetics'] },
  { name: 'Bioprocess Research',    href: '/bioprocess',                 category: 'R&D',        keywords: ['fermentation', 'process', 'bioreactor'] },
  { name: 'Stability Studies',      href: '/shelf-life',                 category: 'R&D',        keywords: ['shelf life', 'stability', 'expiry'] },
  { name: 'Sensory Panels',         href: '/research',                   category: 'R&D',        keywords: ['sensory', 'consumer', 'taste', 'panel'] },
  { name: 'Stock & Inventory',      href: '/inventory',                  category: 'Operations', keywords: ['stock', 'materials', 'supply', 'raw'] },
  { name: 'Equipment Manager',      href: '/equipment',                  category: 'Operations', keywords: ['machines', 'calibration', 'maintenance'] },
  { name: 'Research Calendar',      href: '/calendar',                   category: 'Operations', keywords: ['schedule', 'events', 'dates', 'planner'] },
  { name: 'Document Vault',         href: '/documents',                  category: 'Compliance', keywords: ['files', 'vault', 'document', 'upload'] },
  { name: 'SOPs & Protocols',       href: '/documents?tab=sops',         category: 'Compliance', keywords: ['sop', 'procedure', 'protocol', 'standard'] },
  { name: 'Compliance Calendar',    href: '/compliance',                 category: 'Compliance', keywords: ['regulatory', 'fssai', 'nabl', 'license', 'deadline'] },
  { name: 'CAPA Tracker',           href: '/compliance?tab=capa',        category: 'Compliance', keywords: ['capa', 'ncr', 'deviation', 'corrective', 'preventive'] },
  { name: 'Attendance',             href: '/attendance',                 category: 'Workspace',  keywords: ['check-in', 'check-out', 'timesheet', 'shift', 'gps'] },
  { name: 'Attendance Corrections', href: '/attendance?tab=corrections', category: 'Workspace',  keywords: ['mispunch', 'missed', 'correction', 'checkout'] },
  { name: 'Leave Requests',         href: '/leave',                      category: 'Workspace',  keywords: ['leave', 'vacation', 'absence', 'holiday'] },
  { name: 'Payslips',               href: '/payslips',                   category: 'Workspace',  keywords: ['salary', 'pay', 'slip', 'compensation'] },
  { name: 'My Profile',             href: '/profile',                    category: 'Workspace',  keywords: ['profile', 'account', 'personal', 'id'] },
  { name: 'Staff Directory',        href: '/directory',                  category: 'Workspace',  keywords: ['employees', 'team', 'contacts', 'people'] },
  { name: 'User Management',        href: '/admin/users',                category: 'Admin',      keywords: ['users', 'roles', 'permissions', 'access'] },
  { name: 'Edit Approvals',         href: '/admin/approvals',            category: 'Admin',      keywords: ['approvals', 'requests', 'edits'] },
  { name: 'System Settings',        href: '/admin/settings',             category: 'Admin',      keywords: ['config', 'system', 'preferences'] },
];

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const keyHandler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('oxysearch:open', openHandler);
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('oxysearch:open', openHandler);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = !query.trim()
    ? ALL_ROUTES.slice(0, 8)
    : ALL_ROUTES.filter(route => {
        const q = query.toLowerCase();
        return (
          route.name.toLowerCase().includes(q) ||
          route.category.toLowerCase().includes(q) ||
          route.keywords.some(k => k.includes(q))
        );
      }).slice(0, 8);

  useEffect(() => { setSelected(0); }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) navigate(results[selected].href);
  };

  const navigate = (href) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh] px-4 bg-transparent
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 fade-in duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search modules, features..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded">
            ESC
          </kbd>
          <button onClick={() => setOpen(false)} className="p-1 text-slate-300 hover:text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-2 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No modules found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((route, idx) => (
              <button
                key={idx}
                onClick={() => navigate(route.href)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left group transition-colors ${
                  idx === selected ? 'bg-slate-50' : 'hover:bg-slate-50'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{route.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{route.category}</p>
                </div>
                <ArrowRight className={`w-4 h-4 transition-colors ${
                  idx === selected ? 'text-slate-500' : 'text-slate-200 group-hover:text-slate-400'
                }`} />
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-50 flex items-center gap-4 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
