'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { Plus, Beaker, FlaskConical, Package, Search, X } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import { format } from 'date-fns';

export default function ProductDevelopmentClient({ initialBatches }) {
  const { canDo } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [batches, setBatches] = useState(initialBatches || []);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [showPicker, setShowPicker] = useState(false);
  const [pickerBatches, setPickerBatches] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const canEdit = canDo('batches', 'create');

  // A batch is "in Product Development" once it has at least one formulation
  // record — there's no separate RTD/product-dev batch type, any batch can
  // have a formulation attached to it from its detail page.

  const openPicker = useCallback(async () => {
    setShowPicker(true);
    setPickerLoading(true);
    const { data, error } = await supabase
      .from('batches')
      .select('id, batch_id, current_stage, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) toast.error('Failed to load batches');
    else setPickerBatches(data || []);
    setPickerLoading(false);
  }, [supabase, toast]);

  const filtered = batches.filter(b =>
    !searchTerm ||
    b.batch_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPicker = pickerBatches.filter(b =>
    !pickerSearch || b.batch_id?.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <MobilePageHeader title="Product Development" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Mode switcher */}
        <div className="flex gap-2">
          <span className="px-4 py-2 rounded-xl text-sm font-bold bg-navy text-white shadow-sm">Batch-Linked</span>
          <Link href="/product-development/experiments" className="px-4 py-2 rounded-xl text-sm font-bold bg-white text-slate-600 border border-slate-200 hover:border-navy/50 hover:text-navy transition-colors flex items-center gap-1.5">
            <FlaskConical className="w-4 h-4" /> Standalone R&amp;D
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-navy flex items-center gap-3">
              <Beaker className="w-8 h-8 text-navy" />
              Product Development
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              RTD formulations and ingredient consumption, linked to production batches
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search batches..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-navy/30 outline-none"
              />
            </div>
            {canEdit && (
              <button
                onClick={openPicker}
                className="flex items-center justify-center gap-2 bg-navy text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-navy/20 hover:bg-navy-hover transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Link a Batch</span>
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-navy border-t-transparent rounded-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">No Product Development Batches Yet</h3>
            <p className="text-slate-500 mt-1">
              {canEdit ? 'Click "Link a Batch" to attach an RTD formulation to an existing batch.' : 'No batches have a recorded formulation yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(b => (
              <Link key={b.id} href={`/product-development/${b.id}`}>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-navy/50 transition-all cursor-pointer group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-black text-navy group-hover:text-navy transition-colors">{b.batch_id}</h3>
                      <p className="text-xs font-bold text-slate-400 mt-1">{format(new Date(b.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                      {b.current_stage || 'planned'}
                    </span>
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">{b.product_development_formulations.length} formulation{b.product_development_formulations.length === 1 ? '' : 's'} logged</span>
                    <span className="text-xs font-bold text-navy bg-navy/5 px-2 py-1 rounded-lg">View Details →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showPicker && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Link a Batch</h3>
              <button onClick={() => setShowPicker(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search by batch ID..."
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-navy/30 outline-none"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {pickerLoading ? (
                <div className="flex justify-center p-8"><div className="animate-spin w-6 h-6 border-4 border-navy border-t-transparent rounded-full" /></div>
              ) : filteredPicker.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center p-6">No batches found.</p>
              ) : (
                filteredPicker.map(b => (
                  <button
                    key={b.id}
                    onClick={() => router.push(`/product-development/${b.id}`)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-left"
                  >
                    <div>
                      <p className="text-sm font-black text-slate-800">{b.batch_id}</p>
                      <p className="text-xs text-slate-400">{format(new Date(b.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                      {b.current_stage || b.status || 'planned'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
