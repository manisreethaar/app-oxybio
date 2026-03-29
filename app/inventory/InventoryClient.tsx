'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Package, AlertTriangle, Search, Plus, Calendar, MapPin, Truck, ExternalLink, Loader2, Save, Filter, X, FileText } from 'lucide-react';
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
    item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '',
    purchase_order_number: '', invoice_ref: '', condition_on_arrival: 'Good Condition', notes: '', sds_url: '', coa_url: ''
  });
  const [newIssue, setNewIssue] = useState({ stock_id: '', quantity_issued: '', purpose: 'Production Use', notes: '', batch_reference: '' });
  
  const [newItem, setNewItem] = useState({ name: '', category: 'Raw Material', sub_category: '', unit: '', min_stock_level: '', storage_condition: 'Room Temperature', preferred_supplier: '', hazardous: false, cold_chain_required: false, coa_required: false, allergen: false, organic_certified: '', item_code: '' });
  const [newVendor, setNewVendor] = useState({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '' });
  
  const [modalType, setModalType] = useState('stock'); // 'stock' | 'items' | 'vendors'
  const [trainingStatus, setTrainingStatus] = useState({ isTrained: true });
  const [checkingTraining, setCheckingTraining] = useState(false);

  const subCats = {
    'Raw Material': ['Active Ingredients', 'Excipients & Carriers', 'Packaging Materials'],
    'Lab Consumables': ['Reagents', 'Chemicals', 'Culture Media & Buffers', 'Indicators & Stains', 'Lab Disposables'],
    'Equipment & Maintenance': ['Spare Parts', 'Maintenance Supplies'],
    'Reference Standard': ['Certified Reference Materials', 'Calibration Standards'],
    'RAW MATERIALS LIST': ['Bulk Chemicals', 'Compounds'],
    'GLASSWARES': ['Bottles', 'Flasks', 'Measuring', 'Miscellaneous'],
    'PLASTICS AND CONSUMMABLES': ['Disposables', 'Safety Gear', 'Storage'],
    'PHOTOGRAPHY / DIAGNOSTIC MEDIA': ['Agars', 'Broths'],
    'MICROBIOLOGY CHEMICALS': ['Stains', 'Reagents', 'Solutions']
  };

  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [uploadingCoA, setUploadingCoA] = useState(false);
  const [uploadingSDS, setUploadingSDS] = useState(false);

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 25;

  const supabase = useMemo(() => createClient(), []);


  const checkTraining = useCallback(async (signal) => {
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
  }, [role, employeeProfile]);

  const fetchData = useCallback(async (pageNum = 0, append = false, signal = null) => {
    if (!append) setLoading(true);
    try {
      const start = pageNum * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      let stockQuery = supabase
        .from('inventory_stock')
        .select('*, inventory_items(name, unit, category, min_stock_level, storage_condition), vendors(name)')
        .order('expiry_date', { ascending: true })
        .range(start, end);

      // Search by lot number OR item name (via the joined relation)
      if (searchTerm) {
        stockQuery = stockQuery.or(`supplier_batch_number.ilike.%${searchTerm}%,inventory_items.name.ilike.%${searchTerm}%`);
      }

      const [stockRes, itemsRes, vendorsRes] = await Promise.all([
        stockQuery,
        pageNum === 0 ? supabase.from('inventory_items').select('*').order('name').limit(1000) : Promise.resolve({ data: null }),
        pageNum === 0 ? supabase.from('vendors').select('*').order('name').limit(500) : Promise.resolve({ data: null })
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
  }, [supabase, PAGE_SIZE, searchTerm]);

  // Load more pages (pagination - was missing, caused production crash)
  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage, true);
  }, [page, fetchData]);


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
  }, [employeeProfile, initialStock, fetchData, checkTraining]);

  // Debounced Search Effect
  useEffect(() => {
    const delay = setTimeout(() => {
      setPage(0);
      setHasMore(true);
      fetchData(0, false);
    }, 400); // 400ms debounce
    return () => clearTimeout(delay);
  }, [searchTerm, fetchData]);

  useEffect(() => {
    if (selectedStock) {
      setLoadingMovements(true);
      fetch(`/api/inventory/movements?stock_id=${selectedStock.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setMovements(data.data);
          setLoadingMovements(false);
        })
        .catch(() => setLoadingMovements(false));
    } else {
      setMovements([]);
    }
  }, [selectedStock]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'coa' | 'sds') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'coa') setUploadingCoA(true);
    else setUploadingSDS(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setNewStock(prev => ({ ...prev, [type === 'coa' ? 'coa_url' : 'sds_url']: data.url }));
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (err) {
      alert('Upload Error');
    } finally {
      if (type === 'coa') setUploadingCoA(false);
      else setUploadingSDS(false);
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (uploadingCoA || uploadingSDS) {
      alert("Please wait for files to finish uploading.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStock)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewStock({ 
          item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '',
          purchase_order_number: '', invoice_ref: '', condition_on_arrival: 'Good Condition', notes: '', sds_url: '', coa_url: '' 
        });
        setPage(0); await fetchData(0, false);
      } else { alert((await res.json()).error || 'Failed.'); }
    } catch (err) { alert("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewItem({ 
          name: '', category: 'Raw Material', sub_category: '', unit: '', min_stock_level: '', 
          storage_condition: 'Room Temperature', preferred_supplier: '', hazardous: false, cold_chain_required: false, 
          coa_required: false, allergen: false, organic_certified: '', item_code: '' 
        });
        fetchData(0, false);
      } else { alert((await res.json()).error || 'Failed.'); }
    } catch (err) { alert("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await (supabase.from('vendors').insert([newVendor] as any) as any).select().single();
      if (!error) {
        setIsModalOpen(false);
        setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '' });
        fetchData(0, false);
      } else { alert(error.message || 'Failed.'); }
    } catch (err) { alert("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleSeedCategories = async () => {
    if (!confirm('This will auto-load 115 standard inventory items. Proceed?')) return;
    setIsSubmitting(true);
    const catalogData = {
      "RAW MATERIALS LIST": ["AMPHOTERIC SURFACTANTS (CAPB)", "AOS Liquid", "Sodium Carbonate Anhydrous", "CDEA Flakes", "Acrylates Copolymer (Aqua SF-1)", "Dimethyldichlorosilane (DMDM Hydantoin)", "NaOH Flakes", "TETRASODIUM EDTA (VERSENE 100)", "Propylene glycol (PG)", "Cocomonoethanolamide", "Disodium Laureth Sulfosuccinate (DLS)", "Diethanolamine", "C - 1045", "Kathon CG (MIT/CMIT preservatives)", "Triethanolamine (TEA)", "Xanthan Gum", "Disodium EDTA", "Potassium Hydroxide", "Guar Hydroxypropyltrimonium Chloride (Guar Gum)", "Sodium Lauryl Ether Sulphate (SLES)", "Carbomer (Ultrez 20 / Aqua SF-1)", "Polyquaternium (PQ-7)", "Polyquaternium (PQ-10)", "Glycerin", "Cetostearyl alcohol (CSA / Cetearyl Alcohol)"],
      "GLASSWARES": ["McCartney bottles (Universal bottles)", "Culture tubes - 20ml", "Falcon tubes - 15ml", "Falcon tubes - 50ml", "Conical flasks - 250ml", "Burett - 50ml", "Burett - 100ml", "Pipette - 10ml", "Pipette - 25ml", "Measuring Cylinders - 10ml", "Measuring Cylinders - 50ml", "Measuring Cylinders - 100ml", "Measuring Cylinders - 250ml", "Measuring Cylinders - 500ml", "Measuring Cylinders - 1000ml", "Beaker (Glass) - 50ml", "Beaker (Glass) - 100ml", "Beaker (Glass) - 250ml", "Beaker (Glass) - 500ml", "BOD bottles (Incubation bottles)", "Pipette Pump", "Volumetric flask (250ml)", "Desiccator", "Test tubes", "Separatory funnels - 50ml", "Reagent bottles - (Clear and Amber)", "Erlenmeyer Flasks (Conical flasks)", "Condenser (Liebig condenser)", "Test tube racks (Plastic)", "Burette stand (Retort stand with clamp)", "Buchner funnel (Porcelain)", "Wash bottles (Plastic)", "Glass funnels (60mm)", "Weighing boats (Plastic)", "Watch Glasses"],
      "PLASTICS AND CONSUMMABLES": ["Micropipettes (Adjustable volumes)", "Micropipette Tips - 10ul", "Micropipette Tips - 200ul", "Pasteur Pipettes", "Syringe Filters (0.22 and 0.45 micron)", "Parafilm", "Kimwipes (Lint-free wipes)", "Microcentrifuge Tubes - 1.5ml", "Microcentrifuge Tubes - 2.0ml", "Syringes (1ml, 5ml, 10ml, 20ml)", "Petri dishes (Plastic, empty P90 & P60)", "Sterile Cotton Swabs (Long)", "Inoculating loops - 10ul", "Inoculating loops - 1ul", "Inoculating loop holders", "Cell spreaders (L-shaped, Disposable)", "Disposable Gloves (Nitrile)", "Face masks", "Lab coats (Disposable or Cotton)", "Shoe covers (Disposable)", "Autoclave bags", "Biohazard waste bags", "Aluminum foil", "Autoclave Tape", "Sample bottles (Glass / Plastic) - 250ml", "Sample bottles (Glass / Plastic) - 500ml", "Cotton plugs / Non-absorbent Cotton", "Staining Jars (Coplin Jars) - Glass", "Slide Storage Boxes (Plastic / Wood)"],
      "PHOTOGRAPHY / DIAGNOSTIC MEDIA": ["Blood Agar Base (Columbia Agar base or similar)", "MacConkey agar", "Eosin Methylene Blue (EMB) agar", "Soybean Casein Digest Medium (SCDM / TSB)", "Baird Parker Agar", "Sabouraud Dextrose Agar (SDA)", "Lauryl Tryptose Broth (LTB)", "Brilliant Green Bile Broth (BGBB)"],
      "MICROBIOLOGY CHEMICALS": ["3% Hydrogen Peroxide", "Xylene (Solution or CP)", "DPX Mountant", "Crystal violet (Gram's Method)", "Gram's Iodine", "Safranin (Gram's counterstain)", "95% Ethanol OR Isopropyl alcohol", "Kovac's Reagent (for Indole test)", "Simmons Citrate Agar (Base)", "Methyl Red - Voges-Proskauer (MR-VP) Medium", "Alpha-naphthol (for VP test)", "Potassium Hydroxide (KOH) Solution (40% for VP test)", "TSI (Triple Sugar Iron) Agar", "Urea Agar Base (Christensen's Urea Agar base)", "40% Urea Solution (for Urea Agar)", "Motility Indole Ornithine (MIO) Medium", "Nitrate Broth (or Nitrate test media)", "Sulfanilic acid (Nitrate Reagent A)", "Alpha-naphthylamine (Nitrate Reagent B)", "Zinc powder (for nitrate reduction test)", "Gelatin", "Nutrient Broth / Peptone Water", "Mineral oil (sterile - for biochemical tests)", "Immersion oil (for microscopy)", "Methylene Blue", "Malachite green (Endospore stain)", "Carbol Fuchsin / Ziehl Neelsen Stain (AFB stain)", "Acid Alcohol (For AFB stain)", "Lactophenol cotton blue (for fungal staining)", "Lugol's Iodine", "Oxidase Reagent (Gordon-McLeod reagent / discs)", "Catalase reagent (3% H2O2)", "Barium Chloride (for McFarland standard)", "Sulfuric Acid (for McFarland standard)", "Lysol (Phenol / 5% Phenol solution) OR Dettol (Diluted)"]
    };

    let insertedCount = 0;
    try {
      for (const [category, itemsList] of Object.entries(catalogData)) {
        for (const itemName of itemsList) {
          const payload = {
              name: itemName, category, sub_category: '', unit: 'units', min_stock_level: 1, 
              storage_condition: 'Room Temperature', preferred_supplier: null, hazardous: false, 
              cold_chain_required: false, coa_required: false, allergen: false, organic_certified: '', 
              item_code: `ITM-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
          };
          // Insert silently, don't crash on duplicates
          const { error } = await (supabase.from('inventory_items').insert([payload] as any) as any);
          if (!error) insertedCount++;
        }
      }
      alert(`Success! Auto-Loaded ${insertedCount} items into the database.`);
      fetchData(0, false);
    } catch(err) {
      alert("Error during seed process.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssueStock = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIssue)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewIssue({ stock_id: '', quantity_issued: '', purpose: 'Production Use', notes: '', batch_reference: '' });
        fetchData(0, false);
      } else { alert((await res.json()).error || 'Failed.'); }
    } catch (err) { alert("Network Error"); } finally { setIsSubmitting(false); }
  };

  const [stockFilter, setStockFilter] = useState('all'); // 'all', 'low', 'expiring', 'expired'

  const stats = useMemo(() => {
    const totals = { total: stock.length, low: 0, expiring: 0, expired: 0 };
    stock.forEach(s => {
      const daysLeft = s.expiry_date ? Math.floor((new Date(s.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 999;
      if (daysLeft < 0) totals.expired += 1;
      else if (daysLeft >= 0 && daysLeft < 30) totals.expiring += 1;
      
      const minLevel = parseFloat(s.inventory_items?.min_stock_level) || 0;
      if (s.current_quantity <= minLevel) totals.low += 1;
    });
    return totals;
  }, [stock]);

  const filteredStock = useMemo(() => {
    return stock.filter(s => {
      const daysLeft = s.expiry_date ? Math.floor((new Date(s.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 999;
      const minLevel = parseFloat(s.inventory_items?.min_stock_level) || 0;
      
      if (stockFilter === 'low') return s.current_quantity <= minLevel;
      if (stockFilter === 'expiring') return daysLeft >= 0 && daysLeft < 30;
      if (stockFilter === 'expired') return daysLeft < 0;
      return true;
    });
  }, [stock, stockFilter]);

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
    <div className="max-w-7xl mx-auto space-y-6 pb-40">
      {/* Summary Strip (Section 1) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
        {[
          { label: 'Total Items in Stock', count: stats.total, type: 'all', color: 'teal' },
          { label: 'Low Stock', count: stats.low, type: 'low', color: 'orange' },
          { label: 'Expiring (<30d)', count: stats.expiring, type: 'expiring', color: 'amber' },
          { label: 'Expired', count: stats.expired, type: 'expired', color: 'red' }
        ].map(tile => (
          <button 
            key={tile.type} 
            onClick={() => setStockFilter(tile.type)} 
            className={`p-4 rounded-xl border flex flex-col transition-all text-left ${
              stockFilter === tile.type 
                ? 'bg-white border-teal-500 shadow-md ring-2 ring-teal-100' 
                : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{tile.label}</span>
            <span className={`text-2xl font-black font-mono mt-1 ${
              tile.count > 0 && tile.type !== 'all' ? 'text-red-600' : 'text-teal-800'
            }`}>
              {tile.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-teal-950 font-mono tracking-tighter">Inventory & Supply Chain</h1>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-1">O2B Global Traceability System</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition-all active:scale-95">
            <Filter className="w-4 h-4 mr-2" /> Options
          </button>
          {canDo('inventory', 'edit') && activeTab === 'items' && (
            <button onClick={handleSeedCategories} className="flex items-center px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-900/20 hover:bg-amber-600 transition-all active:scale-95 mr-2">
              Auto-Load Catalog
            </button>
          )}
          {canDo('inventory', 'edit') && (
            <button onClick={() => { setModalType(activeTab); setIsModalOpen(true); }} className="flex items-center px-6 py-3 bg-teal-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-teal-900/20 hover:bg-teal-900 transition-all active:scale-95">
              <Plus className="w-4 h-4 mr-2" /> {activeTab === 'stock' ? 'Receive New Stock' : activeTab === 'items' ? 'Register Item' : 'Add Supplier AVL'}
            </button>
          )}
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
          placeholder="Search by item name or lot number..."
          className="block w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm focus:ring-4 focus:ring-teal-50 focus:border-teal-500 font-bold transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {activeTab === 'stock' && (
        <div className="grid grid-cols-1 gap-4">

          {filteredStock.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center gap-4">
              <Package className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No stock entries yet</p>
                <p className="text-xs font-bold text-gray-400 mt-1">Tap &apos;Receive New Stock&apos; to log your first shipment</p>
              </div>
              {canDo('inventory', 'edit') && (
                <button onClick={() => { setModalType('stock'); setIsModalOpen(true); }} className="mt-2 flex items-center px-4 py-2 bg-teal-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-teal-900 transition-all">
                  Receive Stock
                </button>
              )}
            </div>
          ) : filteredStock.map((s) => {
            const isNearExpiry = s.expiry_date && (new Date(s.expiry_date).getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000);
            const isExpired = s.expiry_date && (new Date(s.expiry_date) < new Date());
            
            return (
              <div 
                key={s.id} 
                onClick={() => setSelectedStock(s)}
                className={`bg-white rounded-3xl border ${isExpired ? 'border-red-200 bg-red-50/30' : 'border-gray-100'} p-6 shadow-sm hover:shadow-md hover:border-teal-100 transition-all flex flex-col lg:flex-row lg:items-center gap-6 group cursor-pointer`}
              >
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
          {items.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center gap-4">
              <Package className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No items registered</p>
                <p className="text-xs font-bold text-gray-400 mt-1">Tap &apos;Register Item&apos; to add your catalog</p>
              </div>
              {canDo('inventory', 'edit') && (
                <button onClick={() => { setModalType('items'); setIsModalOpen(true); }} className="mt-2 flex items-center px-4 py-2 bg-teal-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-teal-900 transition-all">
                  Register Item
                </button>
              )}
            </div>
          ) : items.map(item => (
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
          {vendors.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center gap-4">
              <Truck className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No suppliers added</p>
                <p className="text-xs font-bold text-gray-400 mt-1">Tap &apos;Add Supplier&apos; to expand your AVL</p>
              </div>
              {canDo('inventory', 'edit') && (
                <button onClick={() => { setModalType('vendors'); setIsModalOpen(true); }} className="mt-2 flex items-center px-4 py-2 bg-teal-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-teal-900 transition-all">
                  Add Supplier
                </button>
              )}
            </div>
          ) : vendors.map(vendor => (
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
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] md:max-h-[95vh] animate-in fade-in zoom-in duration-200">
            <div className="px-8 py-6 bg-teal-800 text-white flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  {modalType === 'stock' ? 'Receive Warehouse Shipment' : modalType === 'items' ? 'Register Raw Material' : 'Register Approved Supplier'}
                </h2>
                <p className="text-teal-300 text-[10px] font-bold uppercase tracking-widest mt-1">
                  {modalType === 'stock' ? 'Digital Material Input (DMI)' : modalType === 'items' ? 'BOM Registry updates' : 'Suppliers List update'}
                </p>
              </div>
              {modalType === 'stock' && !trainingStatus.isTrained && !['admin', 'research_fellow', 'scientist'].includes(role) && <AlertTriangle className="w-6 h-6 text-amber-400 font-black animate-pulse" />}
            </div>
            
            {modalType === 'stock' && !trainingStatus.isTrained && !['admin', 'research_fellow', 'scientist'].includes(role) ? (
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
            ) : modalType === 'stock' ? (
              <form onSubmit={handleAddStock} className="p-8 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">PO Number (Optional)</label>
                      <input type="text" placeholder="PO-123" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.purchase_order_number} onChange={e => setNewStock({...newStock, purchase_order_number: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Invoice / Delivery Ref</label>
                      <input type="text" placeholder="INV-456" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.invoice_ref} onChange={e => setNewStock({...newStock, invoice_ref: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Condition on Arrival</label>
                    <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.condition_on_arrival} onChange={e => setNewStock({...newStock, condition_on_arrival: e.target.value})}>
                      <option value="Good Condition">Good Condition</option>
                      <option value="Minor Damage">Minor Damage</option>
                      <option value="Temperature Deviation">Temperature Deviation</option>
                      <option value="Incorrect Labelling">Incorrect Labelling</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-2">
                        CoA Document {uploadingCoA && <Loader2 className="w-3 h-3 animate-spin text-teal-600"/>}
                      </label>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(e, 'coa')} className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer" />
                      {newStock.coa_url && <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 mt-1"><FileText className="w-3 h-3"/> Uploaded</span>}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-2">
                        SDS Document {uploadingSDS && <Loader2 className="w-3 h-3 animate-spin text-amber-600"/>}
                      </label>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(e, 'sds')} className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer" />
                      {newStock.sds_url && <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 mt-1"><FileText className="w-3 h-3"/> Uploaded</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Notes</label>
                    <textarea rows={2} placeholder="General receipt notes..." className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold resize-none" value={newStock.notes} onChange={e => setNewStock({...newStock, notes: e.target.value})} />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-teal-800 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-teal-900 shadow-xl shadow-teal-950/20 transition-all active:scale-95 flex items-center justify-center">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log Entry'}
                  </button>
                </div>
              </form>
            ) : modalType === 'issue' ? (
              <form onSubmit={handleIssueStock} className="p-8 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Select Stock Item</label>
                  <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newIssue.stock_id} onChange={e => setNewIssue({...newIssue, stock_id: e.target.value})}>
                    <option value="">Select Item...</option>
                    {stock.filter(s => s.status === 'Available').map(s => (
                      <option key={s.id} value={s.id}>{s.inventory_items?.name} (Lot: {s.supplier_batch_number || 'N/A'}) - Avail: {s.current_quantity}{s.inventory_items?.unit}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Quantity Issued</label>
                    <input type="number" step="0.01" required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newIssue.quantity_issued} onChange={e => setNewIssue({...newIssue, quantity_issued: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Purpose</label>
                    <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newIssue.purpose} onChange={e => setNewIssue({...newIssue, purpose: e.target.value})}>
                      <option value="Production Use">Production Use</option>
                      <option value="Quality Control Testing">Quality Control Testing</option>
                      <option value="R&D">R&D</option>
                      <option value="Internal Use">Internal Use</option>
                      <option value="Sample">Sample</option>
                      <option value="Disposal">Disposal</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Batch Reference (Optional)</label>
                  <input type="text" placeholder="e.g. B-101" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold font-mono" value={newIssue.batch_reference} onChange={e => setNewIssue({...newIssue, batch_reference: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Notes</label>
                  <textarea rows={2} placeholder="Issue notes..." className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold resize-none" value={newIssue.notes} onChange={e => setNewIssue({...newIssue, notes: e.target.value})} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-teal-800 text-white font-black rounded-2xl text-[10px] hover:bg-teal-900 shadow-xl transition-all">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Issue Stock'}
                  </button>
                </div>
              </form>
            ) : modalType === 'items' ? (
              <form onSubmit={handleAddItem} className="p-8 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Item Code / SKU</label>
                    <input type="text" placeholder="AUTO-GEN" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold font-mono" value={newItem.item_code} onChange={e => setNewItem({...newItem, item_code: e.target.value})} />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Item Name</label>
                    <input type="text" required placeholder="e.g. Citric Acid" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Category</label>
                    <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value, sub_category: ''})}>
                      {Object.keys(subCats).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Sub-Category</label>
                    <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.sub_category} onChange={e => setNewItem({...newItem, sub_category: e.target.value})}>
                      <option value="">Select sub-cat...</option>
                      {(subCats[newItem.category as keyof typeof subCats] || []).map(sub => <option key={sub} value={sub}>{sub}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Unit of Measure</label>
                    <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                      <option value="kg">kg</option><option value="g">g</option><option value="mg">mg</option>
                      <option value="L">L</option><option value="ml">ml</option><option value="units">units</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Storage Condition</label>
                    <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.storage_condition} onChange={e => setNewItem({...newItem, storage_condition: e.target.value})}>
                      <option value="Room Temperature">Room Temperature</option>
                      <option value="Refrigerated 2-8°C">Refrigerated</option>
                      <option value="Frozen -20°C">Frozen -20°C</option>
                      <option value="Chemical Cabinet">Chemical Cabinet</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Min Reorder Level</label>
                    <input type="number" step="0.1" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.min_stock_level} onChange={e => setNewItem({...newItem, min_stock_level: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Preferred Supplier</label>
                    <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.preferred_supplier} onChange={e => setNewItem({...newItem, preferred_supplier: e.target.value})}>
                      <option value="">Select Supplier...</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-50 mt-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={newItem.hazardous} onChange={e => setNewItem({...newItem, hazardous: e.target.checked})} /> Hazardous</label>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={newItem.cold_chain_required} onChange={e => setNewItem({...newItem, cold_chain_required: e.target.checked})} /> Cold Chain</label>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={newItem.coa_required} onChange={e => setNewItem({...newItem, coa_required: e.target.checked})} /> CoA Required</label>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-teal-800 text-white font-black rounded-2xl text-[10px] hover:bg-teal-900 shadow-xl transition-all">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Register Item'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddVendor} className="p-8 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Vendor Name</label>
                  <input type="text" required placeholder="e.g. Sigma Aldrich" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Contact Person</label>
                    <input type="text" placeholder="Full Name" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.contact_person} onChange={e => setNewVendor({...newVendor, contact_person: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Email</label>
                    <input type="email" placeholder="sales@vendor.com" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.email} onChange={e => setNewVendor({...newVendor, email: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Phone</label>
                    <input type="text" placeholder="+12345678" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.phone} onChange={e => setNewVendor({...newVendor, phone: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Payment Terms</label>
                    <input type="text" placeholder="Net 30" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.payment_terms} onChange={e => setNewVendor({...newVendor, payment_terms: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Address</label>
                  <input type="text" placeholder="123 Lab Street" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.address} onChange={e => setNewVendor({...newVendor, address: e.target.value})} />
                </div>
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-teal-800 text-white font-black rounded-2xl text-[10px] hover:bg-teal-900 shadow-xl transition-all">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Add Supplier'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Stock Item Detail Modal (Section 2.4) */}
      {selectedStock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-end">
          <div className="w-full max-w-xl bg-white h-screen shadow-2xl flex flex-col animate-slide-left">
            {/* Header */}
            <div className="p-8 bg-teal-900 text-white relative">
              <button onClick={() => setSelectedStock(null)} className="absolute top-6 right-6 text-white/70 hover:text-white"><X className="w-6 h-6"/></button>
              <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-black uppercase tracking-widest text-white">{selectedStock.inventory_items?.category}</span>
              <h2 className="text-2xl font-black font-mono tracking-tighter mt-1">{selectedStock.inventory_items?.name}</h2>
              <p className="text-xs font-bold text-teal-200 uppercase tracking-widest mt-1">Lot: {selectedStock.supplier_batch_number || 'N/A'}</p>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {/* Summary Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Available Balance</p>
                  <p className="text-2xl font-black font-mono text-teal-800 mt-1">{selectedStock.current_quantity} <span className="text-xs">{selectedStock.inventory_items?.unit}</span></p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Expiry Date</p>
                  <p className={`text-lg font-black mt-1 ${selectedStock.expiry_date && new Date(selectedStock.expiry_date) < new Date() ? 'text-red-600' : 'text-slate-800'}`}>
                    {selectedStock.expiry_date ? new Date(selectedStock.expiry_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Advanced Specs */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-widest">Storage & Location</h4>
                <div className="bg-white border border-slate-100 rounded-xl p-4 divide-y divide-slate-50">
                  <div className="flex justify-between py-2 text-sm">
                    <span className="font-bold text-slate-400">Warehouse Location</span>
                    <span className="font-black text-slate-800">{selectedStock.location || 'Central Store'}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="font-bold text-slate-400">Preferred Supplier</span>
                    <span className="font-black text-slate-800">{selectedStock.vendors?.name || 'Approved Supplier'}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="font-bold text-slate-400">Storage Condition</span>
                    <span className="font-black text-slate-800">{selectedStock.inventory_items?.storage_condition || 'Room Temp'}</span>
                  </div>
                </div>
              </div>

              {/* Movement History */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center justify-between">
                  <span>Movement Ledger</span>
                  {loadingMovements && <Loader2 className="w-3 h-3 animate-spin"/>}
                </h4>
                {movements.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium italic">No recorded movements.</p>
                ) : (
                  <div className="bg-white border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50">
                    {movements.map(m => (
                      <div key={m.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-black text-slate-800">{m.movement_type === 'Receive' ? 'Stock Input' : 'Stock Issue'}</p>
                          <p className="text-slate-400 font-bold mt-0.5">{new Date(m.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black ${m.movement_type === 'Receive' ? 'text-green-600' : 'text-red-600'}`}>
                            {m.movement_type === 'Receive' ? '+' : '-'}{m.quantity}
                          </p>
                          <p className="text-slate-400 font-medium mt-0.5">By {m.issued_by?.email || 'System'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-3">
              <div className="flex gap-2">
                {selectedStock.coa_url && (
                  <a href={selectedStock.coa_url} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <FileText className="w-4 h-4 text-teal-600"/> View CoA
                  </a>
                )}
                {selectedStock.sds_url && (
                  <a href={selectedStock.sds_url} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <FileText className="w-4 h-4 text-amber-600"/> View SDS
                  </a>
                )}
              </div>
              <button 
                onClick={() => {
                  setNewIssue({ stock_id: selectedStock.id, quantity_issued: '', purpose: 'Production Use', notes: '', batch_reference: '' });
                  setModalType('issue');
                  setIsModalOpen(true);
                  setSelectedStock(null);
                }} 
                className="flex-1 py-4 bg-teal-800 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-teal-900 transition-all text-center"
              >
                Issue Stock Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
