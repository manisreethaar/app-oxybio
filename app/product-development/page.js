'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { Plus, Beaker, Package, Search } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import { format } from 'date-fns';

export default function ProductDevelopmentDashboard() {
  const { role, canDo } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('batches')
      .select('id, batch_id, current_stage, status, created_at, product_name, variant')
      .eq('variant', 'RTD')
      .order('created_at', { ascending: false });
      
    if (error) toast.error('Failed to load RTD batches');
    else setBatches(data || []);
    setLoading(false);
  }, [supabase, toast]);
  
  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const filtered = batches.filter(b => 
    !searchTerm || 
    b.batch_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <MobilePageHeader title="Product Development" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-navy flex items-center gap-3">
              <Beaker className="w-8 h-8 text-indigo-600" />
              Product Development
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              Manage formulations and final RTD products
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search RTD batches..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {canDo('manage_batches') && (
              <button 
                onClick={() => toast.info('New RTD feature coming soon')}
                className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New RTD</span>
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">No RTD Batches Found</h3>
            <p className="text-slate-500 mt-1">There are no product development batches matching your criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(b => (
              <Link key={b.id} href={`/product-development/${b.id}`}>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-black text-navy group-hover:text-indigo-600 transition-colors">{b.batch_id}</h3>
                      <p className="text-xs font-bold text-slate-400 mt-1">{format(new Date(b.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                      {b.current_stage || 'planned'}
                    </span>
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">{b.product_name || 'RTD Product'}</span>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">View Details →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
