'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Package, Wrench, BookOpen, AlertTriangle, Clock, CheckSquare,
  ChevronRight, Loader, FlaskConical, ExternalLink,
} from 'lucide-react';
import {
  getLinkedInventory, getLinkedEquipment, getLinkedDeviations,
  getLinkedLabNotebook, getLinkedShelfLife, getLinkedTasks,
  getLinkedIncubation,
} from '@/lib/batchLinks';

const SEV = {
  critical: 'bg-red-100 text-red-700',
  major:    'bg-orange-100 text-orange-700',
  minor:    'bg-yellow-100 text-yellow-700',
};
const PRI = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-gray-100 text-gray-600',
};

function EmptyState({ label }) {
  return (
    <p className="text-sm text-gray-400 text-center py-8">
      No {label} linked to this batch yet.
    </p>
  );
}

function InventoryTab({ rows }) {
  if (!rows.length) return <EmptyState label="inventory usage" />;
  return (
    <div className="space-y-2">
      {rows.map(r => {
        const stock  = r.inventory_stock;
        const item   = stock?.inventory_items;
        const expiry = stock?.expiry_date ? new Date(stock.expiry_date) : null;
        const isExpired = expiry && expiry < new Date();
        return (
          <Link
            key={r.id}
            href="/inventory"
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{item?.name || '—'}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-gray-400">Lot: {stock?.supplier_batch_number || 'N/A'}</span>
                <span className="text-[10px] font-bold text-navy">{r.quantity_used} {item?.unit}</span>
                {expiry && (
                  <span className={`text-[10px] font-bold ${isExpired ? 'text-red-600' : 'text-gray-400'}`}>
                    Exp: {expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

function EquipmentTab({ rows }) {
  if (!rows.length) return <EmptyState label="equipment" />;
  return (
    <div className="space-y-2">
      {rows.map(eq => {
        const dueDate   = eq.calibration_due_date ? new Date(eq.calibration_due_date) : null;
        const calOverdue = dueDate && dueDate < new Date();
        return (
          <Link
            key={eq.id}
            href="/equipment"
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">{eq.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-gray-400">{eq.model || '—'}</span>
                {calOverdue ? (
                  <span className="text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Cal Overdue</span>
                ) : dueDate ? (
                  <span className="text-[10px] text-gray-400">
                    Cal due: {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                ) : null}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${eq.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {eq.status}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

function NotebookTab({ rows }) {
  if (!rows.length) return <EmptyState label="lab notebook entries" />;
  return (
    <div className="space-y-2">
      {rows.map(entry => (
        <Link
          key={entry.id}
          href="/lab-notebook"
          className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{entry.title || 'Untitled Entry'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                entry.status === 'signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {entry.status || 'draft'}
              </span>
              {entry.employees?.full_name && (
                <span className="text-[10px] text-gray-400">by {entry.employees.full_name}</span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
        </Link>
      ))}
    </div>
  );
}

function DeviationsTab({ rows }) {
  if (!rows.length) return <EmptyState label="deviations" />;
  return (
    <div className="space-y-2">
      {rows.map(dev => {
        const inv  = dev.investigations?.[0];
        const capa = inv?.capa_actions?.[0];
        return (
          <Link
            key={dev.id}
            href="/capa"
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${SEV[dev.severity] || 'bg-gray-100 text-gray-600'}`}>
                  {dev.severity}
                </span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                  dev.status === 'closed' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                }`}>
                  {dev.status}
                </span>
              </div>
              <p className="text-sm font-bold text-gray-800 truncate">{dev.title}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-gray-400">
                  Investigation: {inv ? (inv.root_cause_identified ? '✓ Done' : 'In progress') : 'Pending'}
                </span>
                <span className="text-[10px] text-gray-400">
                  CAPA: {capa ? (capa.effectiveness_verified ? '✓ Verified' : 'Open') : 'Pending'}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

function ShelfLifeTab({ rows }) {
  if (!rows.length) return <EmptyState label="shelf-life studies" />;
  return (
    <div className="space-y-2">
      {rows.map(study => (
        <Link
          key={study.id}
          href="/shelf-life"
          className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{study.storage_condition || 'Study'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {study.status && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                  study.status === 'complete' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {study.status}
                </span>
              )}
              <span className="text-[10px] text-gray-400">
                {new Date(study.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
        </Link>
      ))}
    </div>
  );
}

function IncubationTab({ rows }) {
  if (!rows.length) return <EmptyState label="incubation records" />;
  return (
    <div className="space-y-2">
      {rows.map(r => {
        const ongoing   = !r.end_time;
        const sterility = r.sterility_status;
        return (
          <Link
            key={r.id}
            href="/research/incubation"
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{r.sample_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-gray-400">{r.sample_type}</span>
                {r.batch_flasks?.flask_label && (
                  <span className="text-[10px] font-bold text-navy">{r.batch_flasks.flask_label}</span>
                )}
                {r.source_stage && (
                  <span className="text-[10px] text-gray-400 capitalize">{r.source_stage.replace(/_/g, ' ')}</span>
                )}
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                  ongoing ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {ongoing ? 'Ongoing' : `${Number(r.duration_hours || 0).toFixed(1)}h`}
                </span>
                {sterility && sterility !== 'Pending' && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                    sterility === 'Sterile' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {sterility}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

function TasksTab({ rows }) {
  if (!rows.length) return <EmptyState label="tasks" />;
  return (
    <div className="space-y-2">
      {rows.map(task => {
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const overdue = dueDate && dueDate < new Date() && task.status !== 'done';
        return (
          <Link
            key={task.id}
            href="/tasks"
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{task.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${PRI[task.priority] || 'bg-gray-100 text-gray-600'}`}>
                  {task.priority}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                  task.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {task.status}
                </span>
                {task.employees?.full_name && (
                  <span className="text-[10px] text-gray-400">→ {task.employees.full_name}</span>
                )}
                {dueDate && (
                  <span className={`text-[10px] font-bold ${overdue ? 'text-red-600' : 'text-gray-400'}`}>
                    {overdue ? '⚠ Overdue' : `Due ${dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

export default function LinkedRecordsPanel({ batch, supabase }) {
  const [activeTab, setActiveTab] = useState('inventory');
  const [all,       setAll]       = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAll(null);
    Promise.all([
      getLinkedInventory(supabase, batch.id),
      getLinkedEquipment(supabase, batch.id),
      getLinkedLabNotebook(supabase, batch.id),
      getLinkedDeviations(supabase, batch.id),
      getLinkedShelfLife(supabase, batch.id),
      getLinkedTasks(supabase, batch.id),
      getLinkedIncubation(supabase, batch.id),
    ]).then(([inventory, equipment, notebook, deviations, shelflife, tasks, incubation]) => {
      if (!active) return;
      setAll({ inventory, equipment, notebook, deviations, shelflife, tasks, incubation });
      setLoading(false);
    });
    return () => { active = false; };
  }, [batch.id, supabase]);

  const TABS = useMemo(() => [
    { id: 'inventory',  label: 'Inventory Used',   icon: Package,       count: all?.inventory.length,  href: '/inventory'            },
    { id: 'equipment',  label: 'Equipment',         icon: Wrench,        count: all?.equipment.length,  href: '/equipment'            },
    { id: 'notebook',   label: 'Lab Notebook',      icon: BookOpen,      count: all?.notebook.length,   href: '/lab-notebook'         },
    { id: 'deviations', label: 'Deviations & CAPA', icon: AlertTriangle, count: all?.deviations.length, href: '/compliance'           },
    { id: 'shelflife',  label: 'Shelf-Life',        icon: Clock,         count: all?.shelflife.length,  href: '/shelf-life'           },
    { id: 'tasks',      label: 'Tasks',             icon: CheckSquare,   count: all?.tasks.length,      href: '/tasks'                },
    { id: 'incubation', label: 'Incubation',        icon: FlaskConical,  count: all?.incubation.length, href: '/research/incubation'  },
  ], [all]);

  return (
    <div className="surface mt-6">
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Records</h3>
          {(() => {
            const tab = TABS.find(t => t.id === activeTab);
            return tab ? (
              <Link href={tab.href} className="flex items-center gap-1 text-[10px] font-black text-navy hover:text-navy-hover transition-colors">
                Open {tab.label} <ExternalLink className="w-3 h-3"/>
              </Link>
            ) : null;
          })()}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(tab => {
            const Icon   = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  active ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                    active ? 'bg-white/25 text-white' : 'bg-navy text-white'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader className="w-5 h-5 animate-spin mr-2" /> Loading linked records…
          </div>
        )}
        {!loading && activeTab === 'inventory'  && <InventoryTab  rows={all.inventory}  />}
        {!loading && activeTab === 'equipment'  && <EquipmentTab  rows={all.equipment}  />}
        {!loading && activeTab === 'notebook'   && <NotebookTab   rows={all.notebook}   />}
        {!loading && activeTab === 'deviations' && <DeviationsTab rows={all.deviations} />}
        {!loading && activeTab === 'shelflife'  && <ShelfLifeTab  rows={all.shelflife}  />}
        {!loading && activeTab === 'tasks'      && <TasksTab      rows={all.tasks}      />}
        {!loading && activeTab === 'incubation' && <IncubationTab rows={all.incubation} />}
      </div>
    </div>
  );
}
