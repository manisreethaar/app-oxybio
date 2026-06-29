'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  BookOpen, Search, ChevronDown, ChevronRight, X,
  Users, CalendarCheck, FlaskConical, ShieldCheck, Clock,
  AlertTriangle, CheckSquare, Microscope, TrendingUp, Settings,
  FileText, Calendar, Book, ExternalLink, Printer,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { HELP_CONTENT, getRoleGroup, getRoleGroupLabel } from './helpContent';

// ── Icon map for quick action icons ──────────────────────────────────────────
const ICON_MAP = {
  users: Users,
  'calendar-check': CalendarCheck,
  flask: FlaskConical,
  'shield-check': ShieldCheck,
  clock: Clock,
  'alert-triangle': AlertTriangle,
  'check-square': CheckSquare,
  microscope: Microscope,
  'trending-up': TrendingUp,
  settings: Settings,
  'file-text': FileText,
  calendar: Calendar,
  'book-open': Book,
};

// ── Markdown-lite renderer ────────────────────────────────────────────────────
// Handles bold, inline code, bullets, numbered lists, headers, line breaks.
function renderContent(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-3 border-gray-200" />);
      i++;
      continue;
    }

    // ## Header
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-1">
          {line.slice(3)}
        </h3>
      );
      i++;
      continue;
    }

    // # Header
    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="text-base font-bold text-gray-900 mt-4 mb-2">
          {line.slice(2)}
        </h2>
      );
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullets
    if (line.startsWith('- ') || line.startsWith('✅ ') || line.startsWith('❌ ')) {
      const bullets = [];
      while (
        i < lines.length &&
        (lines[i].startsWith('- ') || lines[i].startsWith('✅ ') || lines[i].startsWith('❌ '))
      ) {
        bullets.push(lines[i]);
        i++;
      }
      elements.push(
        <ul key={i} className="my-1.5 space-y-1">
          {bullets.map((b, j) => (
            <li key={j} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <span>{inlineFormat(b.replace(/^[-✅❌] /, ''))}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\./.test(line)) {
      const steps = [];
      while (i < lines.length && /^\d+\./.test(lines[i])) {
        steps.push(lines[i].replace(/^\d+\.\s*/, ''));
        i++;
      }
      elements.push(
        <ol key={i} className="my-2 space-y-1.5 list-none">
          {steps.map((s, j) => (
            <li key={j} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                {j + 1}
              </span>
              <span className="pt-0.5">{inlineFormat(s)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm text-gray-700 leading-relaxed my-1.5">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function inlineFormat(text) {
  // Split by bold markers **text** and inline code `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 bg-gray-100 text-blue-700 text-xs rounded font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ── Single article accordion ──────────────────────────────────────────────────
function Article({ article, defaultOpen = false, searchQuery = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);

  // Auto-open when search matches
  useEffect(() => {
    if (searchQuery && open === false) {
      const matches =
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (article.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      if (matches) setOpen(true);
    }
    if (!searchQuery) setOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const highlightText = (text) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden transition-all hover:border-blue-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left bg-white hover:bg-gray-50 transition-colors group"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">
          {highlightText(article.title)}
        </span>
        <span className="flex-shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div
          ref={contentRef}
          className="px-4 pb-4 pt-1 bg-white border-t border-gray-100"
        >
          {renderContent(article.content)}
        </div>
      )}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ section, searchQuery }) {
  const [collapsed, setCollapsed] = useState(false);

  const visibleArticles = useMemo(() => {
    if (!searchQuery) return section.articles;
    const q = searchQuery.toLowerCase();
    return section.articles.filter(
      a =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [section.articles, searchQuery]);

  if (searchQuery && visibleArticles.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            {visibleArticles.length} {visibleArticles.length === 1 ? 'article' : 'articles'}
          </span>
          {collapsed
            ? <ChevronRight className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>

      {/* Articles */}
      {!collapsed && (
        <div className="px-5 pb-5 space-y-2">
          {visibleArticles.map(article => (
            <Article
              key={article.id}
              article={article}
              defaultOpen={!!searchQuery}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick action pill ─────────────────────────────────────────────────────────
function QuickAction({ action }) {
  const Icon = ICON_MAP[action.icon] || ExternalLink;
  return (
    <a
      href={action.href}
      className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700
                 hover:bg-blue-600 hover:border-blue-600 hover:text-white transition-all shadow-sm group"
    >
      <Icon className="w-4 h-4 text-blue-500 group-hover:text-white transition-colors flex-shrink-0" />
      {action.label}
    </a>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
const ROLE_BADGE_STYLES = {
  admin: 'bg-slate-100 text-slate-700 border-slate-200',
  fellow: 'bg-blue-100 text-blue-700 border-blue-200',
  intern: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HelpPage() {
  const { employeeProfile, loading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const roleGroup = useMemo(
    () => getRoleGroup(employeeProfile?.role),
    [employeeProfile?.role]
  );

  const content = useMemo(() => HELP_CONTENT[roleGroup], [roleGroup]);

  // Tabs = sections
  const tabs = useMemo(() => {
    if (!content) return [];
    return [
      { id: 'all', label: 'All Topics' },
      ...content.sections.map(s => ({ id: s.id, label: s.title })),
    ];
  }, [content]);

  const visibleSections = useMemo(() => {
    if (!content) return [];
    if (searchQuery) return content.sections; // search overrides tab
    if (activeTab === 'all') return content.sections;
    return content.sections.filter(s => s.id === activeTab);
  }, [content, activeTab, searchQuery]);

  const totalArticles = useMemo(() => {
    if (!content) return 0;
    return content.sections.reduce((sum, s) => sum + s.articles.length, 0);
  }, [content]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-20">
        <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const roleGroupLabel = getRoleGroupLabel(roleGroup);
  const firstName = employeeProfile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24 print:max-w-none print:pb-0">

      {/* ── Header ── */}
      <div className="print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Help & Manual</h1>
                <p className="text-xs text-gray-400 mt-0.5">OxyOS Platform · Oxygen Bioinnovations</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE_STYLES[roleGroup]}`}>
                {roleGroupLabel}
              </span>
              <span className="text-sm text-gray-500">
                {totalArticles} articles tailored for you, {firstName}
              </span>
            </div>
          </div>

          {/* Print button */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm flex-shrink-0"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Print header — only in print */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-black text-gray-900">OxyOS — Help & Manual</h1>
        <p className="text-gray-500 text-sm mt-1">Oxygen Bioinnovations · Internal Use Only · {roleGroupLabel}</p>
      </div>

      {/* ── Quick Actions ── */}
      {content?.quickActions && (
        <div className="print:hidden">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Quick Access</p>
          <div className="flex flex-wrap gap-2">
            {content.quickActions.map(action => (
              <QuickAction key={action.href} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="relative print:hidden">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search help articles…"
          className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800
                     placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     shadow-sm transition-all"
          aria-label="Search help articles"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search result count */}
      {searchQuery && (
        <div className="text-sm text-gray-500 print:hidden">
          Showing results for <span className="font-semibold text-gray-800">"{searchQuery}"</span>
          {' — '}
          {visibleSections.reduce((count, s) => {
            const q = searchQuery.toLowerCase();
            return count + s.articles.filter(
              a => a.title.toLowerCase().includes(q) ||
                   a.content.toLowerCase().includes(q) ||
                   (a.tags || []).some(t => t.toLowerCase().includes(q))
            ).length;
          }, 0)} articles found
        </div>
      )}

      {/* ── Tab bar ── */}
      {!searchQuery && (
        <div className="flex gap-1 overflow-x-auto pb-1 print:hidden scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content sections ── */}
      <div className="space-y-4">
        {visibleSections.map(section => (
          <Section
            key={section.id}
            section={section}
            searchQuery={searchQuery}
          />
        ))}

        {/* No results state */}
        {searchQuery && visibleSections.every(s => {
          const q = searchQuery.toLowerCase();
          return !s.articles.some(
            a => a.title.toLowerCase().includes(q) ||
                 a.content.toLowerCase().includes(q) ||
                 (a.tags || []).some(t => t.toLowerCase().includes(q))
          );
        }) && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Search className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">No results found</h3>
            <p className="text-sm text-gray-500 mb-4">
              No articles match <span className="font-semibold">"{searchQuery}"</span>
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="mt-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl print:hidden">
        <p className="text-sm font-bold text-gray-800 mb-1">Still need help?</p>
        <p className="text-sm text-gray-600">
          Use the <span className="font-semibold text-blue-700">AI Assistant</span> (chat bubble icon) for quick answers,
          message your admin directly, or reach out to your supervising scientist.
        </p>
      </div>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          @page { margin: 2cm; }
          body { font-size: 11pt; }
          nav, aside, header, footer { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
