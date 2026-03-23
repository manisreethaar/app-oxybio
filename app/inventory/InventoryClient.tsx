'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Package, AlertTriangle, Search, Plus, Calendar, MapPin, Truck, ExternalLink, Loader2, Save, Filter } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function InventoryClient({ initialStock, initialItems, initialVendors }: { initialStock: any[], initialItems: any[], initialVendors: any[] }) {
  const { role, canDo, employeeProfile, loading: authLoading } = useAuth() as any;
  const [activeTab, setActiveTab] = useState('stock');
  const [stock, setStock] = useState(initialStock || []);
  const [items, setItems] = useState(initialItems || []);
  const [vendors, setVendors] = useState(initialVendors || []);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newStock, setNewStock] = useState({
    item_id: '',
    vendor_id: '',
    supplier_batch_number: '',
    received_quantity: '',
    expiry_date: '',
    location: ''
  });
  const [trainingStatus, setTrainingStatus] = useState({ isTrained: true });
  const [checkingTraining, setCheckingTraining] = useState(false);

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 25;

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadAll = async () => {
      try {
        await fetchData(0, false, controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') console.error("Inventory fetch failed:", err);
      }
    };

    if (employeeProfile) {
      if (!initialStock || initialStock.length === 0) {
        loadAll();
      }
      checkTraining(controller.signal);
    }

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [employeeProfile, initialStock]);

  // Reset pagination when searching
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    fetchData(0, false);
  }, [searchTerm]);

  const checkTraining = async (signal) => {
    if (role === 'admin') {
      setTrainingStatus({ isTrained: true });
      return;
    }
    setCheckingTraining(true);
    try {
      const res = await fetch(`/api/training/check?employeeId=${employeeProfile.id}&category=Sanitation`, { signal });
      const data = await res.json();
      setTrainingStatus(data);
    } catch (err) {
      if (err.name !== 'AbortError') console.error("Training check failed:", err);
    } finally {
      setCheckingTraining(false);
    }
  };

  const fetchData = async (pageNum = 0, append = false, signal = null) => {
    if (!append) setLoading(true);
    try {
      const start = pageNum * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      let stockQuery = supabase
        .from('inventory_stock')
        .select('*, inventory_items(name, unit, category), vendors(name)')
        .order('expiry_date', { ascending: true })
        .range(start, end);

      if (searchTerm) {
        stockQuery = stockQuery.ilike('supplier_batch_number', `%${searchTerm}%`);
      }

      const [stockRes, itemsRes, vendorsRes] = await Promise.all([
        stockQuery,
        pageNum === 0 ? supabase.from('inventory_items').select('*').order('name').limit(1000) : Promise.resolve({ data: items }),
        pageNum === 0 ? supabase.from('vendors').select('*').order('name').limit(500) : Promise.resolve({ data: vendors })
      ]);

      if (stockRes.error) throw stockRes.error;

      if (append) {
        setStock(prev => [...prev, ...(stockRes.data || [])]);
      } else {
        setStock(stockRes.data || []);
      }

      setHasMore(stockRes.data?.length === PAGE_SIZE);

      if (pageNum === 0) {
        if (itemsRes.data) setItems(itemsRes.data);
        if (vendorsRes.data) setVendors(vendorsRes.data);
      }
    } catch (err) {
      console.error("Data synchronization failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage, true);
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // Concurrency Lock
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStock)
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        setNewStock({ item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '' });
        setPage(0);
        await fetchData(0, false);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to log stock entry.');
      }
    } catch (err) {
      alert("Network Error: Could not connect to the operations server. Please check connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStock = stock; // Filtering is handled server-side via ilike in fetchData

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center"><Skeleton width={300} height={40}/> <Skeleton width={150} height={40}/></div>
        <Skeleton className="h-12 w-full rounded-2xl"/>
        <div className="grid grid-cols-1 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-3xl"/>)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-teal-950 font-mono tracking-tighter">Inventory & Supply Chain</h1>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-1">O2B Global Traceability System</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition-all active:scale-95">
            <Filter className="w-4 h-4 mr-2" /> Options
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center px-6 py-3 bg-teal-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-teal-900/20 hover:bg-teal-900 transition-all active:scale-95">
            <Plus className="w-4 h-4 mr-2" /> Receive New Stock
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('stock')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'stock' ? 'border-teal-600 text-teal-900 bg-teal-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Stock Log</button>
        <button onClick={() => setActiveTab('items')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'items' ? 'border-teal-600 text-teal-900 bg-teal-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Item Registry</button>
        <button onClick={() => setActiveTab('vendors')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'vendors' ? 'border-teal-600 text-teal-900 bg-teal-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Suppliers (AVL)</button>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search by lot number..."
          className="block w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm focus:ring-4 focus:ring-teal-50 focus:border-teal-500 font-bold transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {activeTab === 'stock' && (
        <div className="grid grid-cols-1 gap-4">

          {/* Reorder Intelligence Panel */}
          {(() => {
            const flagged = stock.filter(s => {
              const daysLeft = s.expiry_date ? Math.floor((new Date(s.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 999;
              return daysLeft < 30 || (s.current_quantity !== undefined && s.current_quantity <= 0);
            });
            if (flagged.length === 0) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-black text-amber-800 uppercase tracking-widest">Reorder Intelligence — {flagged.length} Item{flagged.length > 1 ? 's' : ''} Need Attention</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {flagged.map(s => {
                    const daysLeft = s.expiry_date ? Math.floor((new Date(s.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const isExpired = daysLeft !== null && daysLeft < 0;
                    const isZero = s.current_quantity <= 0;
                    return (
                      <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-bold ${
                        isExpired ? 'bg-red-50 border-red-200 text-red-800' : isZero ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-orange-50 border-orange-200 text-orange-800'
                      }`}>
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate">{s.inventory_items?.name || 'Unknown Item'}</p>
                          <p className="text-[10px] font-black uppercase tracking-wider mt-0.5 opacity-70">
                            {isExpired ? `Expired ${Math.abs(daysLeft)}d ago` : isZero ? 'Out of Stock' : `Expires in ${daysLeft}d`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}


          {filteredStock.map((s) => {
            const isNearExpiry = s.expiry_date && (new Date(s.expiry_date).getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000);
            const isExpired = s.expiry_date && (new Date(s.expiry_date) < new Date());
            
            return (
              <div key={s.id} className={`bg-white rounded-3xl border ${isExpired ? 'border-red-200 bg-red-50/30' : 'border-gray-100'} p-6 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center gap-6 group`}>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${s.inventory_items?.category === 'Raw Material' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                      {s.inventory_items?.category}
                    </span>
                    {(isExpired || isNearExpiry) && (
                      <span className={`flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isExpired ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                        <AlertTriangle className="w-3 h-3 mr-1" /> {isExpired ? 'Expired' : 'Near Expiry'}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-teal-950 mb-1">{s.inventory_items?.name}</h3>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <Truck className="w-3.5 h-3.5 mr-1.5" /> Lot: <span className="text-teal-900 ml-1">{s.supplier_batch_number || 'N/A'}</span>
                    </div>
                    <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <MapPin className="w-3.5 h-3.5 mr-1.5" /> Loc: <span className="text-teal-900 ml-1">{s.location || 'Central Store'}</span>
                    </div>
                    <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <Calendar className="h-3.5 w-3.5 mr-1.5" /> Expiry: <span className={`ml-1 ${isExpired ? 'text-red-600' : 'text-teal-900'}`}>{s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 lg:text-right">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Available Balanced</p>
                    <p className={`text-2xl font-black font-mono tracking-tighter ${s.current_quantity <= 0 ? 'text-gray-300' : 'text-teal-800'}`}>
                      {s.current_quantity} <span className="text-xs">{s.inventory_items?.unit}</span>
                    </p>
                  </div>
                  <div className="h-12 w-[1px] bg-gray-100"></div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Vendor</p>
                    <p className="text-sm font-black text-gray-800">{s.vendors?.name || 'Approved Local supplier'}</p>
                  </div>
                </div>
              </div>
            );
          })}
          
          {loading ? (
            <div className="space-y-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-3xl"/>)}
            </div>
          ) : hasMore && (
            <div className="pt-4 flex justify-center">
              <button 
                onClick={loadMore}
                disabled={loading}
                className="px-8 py-3 bg-white border border-teal-100 text-teal-800 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-50 transition-all flex items-center gap-2"
              >
                Load More Records
              </button>
            </div>
          )}
        </div>
      )}

      {/* Item Registry Tab */}
      {activeTab === 'items' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 mb-2 inline-block">{item.category}</span>
              <h3 className="text-lg font-black text-teal-950">{item.name}</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Unit: {item.unit}</p>
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Reorder Point</p>
                <p className="text-sm font-black text-teal-800">{item.reorder_level || 'Not set'} {item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map(vendor => (
            <div key={vendor.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <h3 className="text-lg font-black text-teal-950">{vendor.name}</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{vendor.contact_person || 'No Contact'}</p>
              <div className="mt-4 pt-4 border-t border-gray-50 space-y-2">
                <p className="text-xs font-bold text-gray-600 flex items-center gap-2"><ExternalLink className="w-3 h-3"/> {vendor.email || 'No email'}</p>
                <div className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded inline-block">Approved Supplier</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for adding stock */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-teal-950/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-8 py-6 bg-teal-800 text-white flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight">Receive Warehouse Shipment</h2>
                <p className="text-teal-300 text-[10px] font-bold uppercase tracking-widest mt-1">Digital Material Input (DMI)</p>
              </div>
              {!trainingStatus.isTrained && <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />}
            </div>
            
            {!trainingStatus.isTrained ? (
              <div className="p-12 bg-white flex flex-col items-center text-center gap-6">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center"><Package className="w-10 h-10 text-amber-500" /></div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Training Required</h3>
                  <p className="text-sm text-slate-500 font-medium mt-2 max-w-xs mx-auto">To maintain GMP compliance, you must read and sign the <b>Sanitation SOP</b> before handling warehouse stock.</p>
                </div>
                <div className="flex flex-col gap-3 w-full">
                  <Link href="/sops" className="w-full py-4 bg-teal-800 text-white font-black rounded-2xl shadow-lg hover:bg-teal-900 transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">Open SOP Library</Link>
                  <button onClick={() => setIsModalOpen(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">Close Window</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddStock} className="p-8 space-y-5">
                <div className="grid grid-cols-1 gap-5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Inventory Item</label>
                    <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold"
                      value={newStock.item_id} onChange={(e) => setNewStock({...newStock, item_id: e.target.value})}>
                      <option value="">Select Item...</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Supplier / Vendor</label>
                    <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold"
                      value={newStock.vendor_id} onChange={(e) => setNewStock({...newStock, vendor_id: e.target.value})}>
                      <option value="">Select Supplier...</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Quantity Recvd</label>
                      <input type="number" step="0.01" required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                        value={newStock.received_quantity} onChange={(e) => setNewStock({...newStock, received_quantity: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Supplier Batch #</label>
                      <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold font-mono" 
                        value={newStock.supplier_batch_number} onChange={(e) => setNewStock({...newStock, supplier_batch_number: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Expiry Date</label>
                      <input type="date" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                        value={newStock.expiry_date} onChange={(e) => setNewStock({...newStock, expiry_date: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Warehouse Location</label>
                      <input type="text" placeholder="e.g. Shelf A1" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                        value={newStock.location} onChange={(e) => setNewStock({...newStock, location: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-teal-800 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-teal-900 shadow-xl shadow-teal-950/20 transition-all active:scale-95 flex items-center justify-center">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log Entry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
