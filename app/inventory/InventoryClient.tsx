// @ts-nocheck
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Package, AlertTriangle, Search, Plus, Calendar, MapPin, Truck, ExternalLink, Loader2, Save, Filter, X, FileText, Trash2, Archive, ChevronRight, ChevronDown, Edit3, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import EditRequestButton from '@/components/ui/EditRequestButton';
import CreatorBadge from '@/components/ui/CreatorBadge';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import StockModal from './components/StockModal';
import ItemVendorModal from './components/ItemVendorModal';
import PurchaseRequestsTab from './components/PurchaseRequestsTab';
import TraceabilityTab from './components/TraceabilityTab';
import {
  filterStock,
  getItemStats,
  getStockFilterLabel,
  getStockRisk,
  getStockStats,
  type StockFilter,
} from './inventoryUtils';

export default function InventoryClient({ initialStock, initialItems, initialVendors, initialSearch = '' }: { initialStock: any[], initialItems: any[], initialVendors: any[], initialSearch?: string }) {
  const { user, role, isAdmin, canDo, employeeProfile, loading: authLoading } = useAuth() as any;
  const canEditItems = ['admin', 'ceo', 'cto', 'research_fellow', 'scientist'].includes(role) || isAdmin;
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('stock');
  const [stock, setStock] = useState(initialStock || []);
  const [items, setItems] = useState(initialItems || []);
  const [vendors, setVendors] = useState(initialVendors || []);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newStock, setNewStock] = useState({
    item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '',
    purchase_order_number: '', invoice_ref: '', condition_on_arrival: 'Good Condition', notes: '', sds_url: '', coa_url: ''
  });
  const [newIssue, setNewIssue] = useState({ stock_id: '', quantity_issued: '', purpose: 'Production Use', notes: '', batch_reference: '' });
  const [showOptions, setShowOptions] = useState(false);
  
  const [newItem, setNewItem] = useState({ name: '', category: 'Raw Material', sub_category: '', unit: '', min_stock_level: '', storage_condition: 'Room Temperature', preferred_supplier: '', hazardous: false, cold_chain_required: false, coa_required: false, allergen: false, organic_certified: '', item_code: '' });
  const [newVendor, setNewVendor] = useState({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '', status: 'Approved', qualification_status: 'Unqualified', qualified_at: '', qualification_notes: '', audit_due_date: '' });
  
  const [modalType, setModalType] = useState('stock'); // 'stock' | 'items' | 'vendors'
  const [trainingStatus, setTrainingStatus] = useState({ isTrained: true });
  const [checkingTraining, setCheckingTraining] = useState(false);

  const subCats = {
    'RAW MATERIALS': ['Active Ingredients', 'Excipients & Carriers', 'Culture Media'],
    'REAGENTS & STAINS': ['Analytical Reagents', 'Dyes & Stains', 'Biochemical Test Compounds'],
    'CHEMICALS & BIOCHEMICALS': ['Buffer Salts', 'Organic Solvents', 'Inorganic Salts', 'Protein & Bio Standards', 'Vitamins & Nutrients', 'Polymers & Surfactants'],
  };

  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [showQR, setShowQR] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [uploadingCoA, setUploadingCoA] = useState(false);
  const [uploadingSDS, setUploadingSDS] = useState(false);
  
  // Registry specific state
  const [registrySearch, setRegistrySearch] = useState('');
  const [registrySort, setRegistrySort] = useState('name');
  const [stockSort, setStockSort] = useState('expiry');
  // removed isSelectMode
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'item' | 'vendor'>('item');
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingSeed, setPendingSeed] = useState(false);

  // Pending edit-request tracking
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Multi-select state

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

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
    setSyncError('');
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
        pageNum === 0 ? supabase.from('inventory_items').select('*, created_by, creator:employees!inventory_items_created_by_fkey(id, full_name, initials)').order('name').limit(1000) : Promise.resolve({ data: null }),
        pageNum === 0 ? supabase.from('vendors').select('*').order('name').limit(500) : Promise.resolve({ data: null })
      ]);

      if (stockRes.error) throw stockRes.error;

      const stockData = stockRes.data || [];

      if (append) {
        setStock(prev => [...prev, ...stockData]);
      } else {
        setStock(stockData);
      }

      setHasMore(stockData.length === PAGE_SIZE);

      if (pageNum === 0) {
        if (itemsRes.data) setItems(itemsRes.data);
        if (vendorsRes.data) setVendors(vendorsRes.data);
      }

      // Fetch batch usage for loaded stock IDs
      if (stockData.length > 0) {
        const stockIds = stockData.map((s: any) => s.id);
        const { data: usageData } = await supabase
          .from('inventory_usage')
          .select('stock_id, batches(id, batch_id)')
          .in('stock_id', stockIds);
        if (usageData) {
          const map: Record<string, Array<{id: string, batch_id: string}>> = {};
          usageData.forEach((u: any) => {
            if (!u.batches) return;
            if (!map[u.stock_id]) map[u.stock_id] = [];
            const already = map[u.stock_id].find(b => b.id === u.batches.id);
            if (!already) map[u.stock_id].push({ id: u.batches.id, batch_id: u.batches.batch_id });
          });
          setBatchUsageMap(prev => append ? { ...prev, ...map } : map);
        }
      }
    } catch (err) {
      console.error("Data synchronization failed:", err);
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setSyncError('Inventory data could not be refreshed. Check the connection and try again.');
      }
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
      fetch('/api/edit-request').then(r => r.ok ? r.json() : null).then(d => {
        if (d?.data) setPendingIds(new Set(d.data.filter((r: any) => r.status === 'pending').map((r: any) => r.record_id)));
      });
    }

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [employeeProfile, initialStock, fetchData, checkTraining]);

  // Realtime: warehouse_stock changes (receipts, issues, adjustments from other users)
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('inventory_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        fetchData(page, false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        fetchData(page, false);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Registry Grouping & Filtering
  const filteredRegistry = useMemo(() => {
    let result = [...items];
    if (registrySearch) {
      result = result.filter(i => 
        (i.name || '').toLowerCase().includes(registrySearch.toLowerCase()) || 
        (i.item_code || '').toLowerCase().includes(registrySearch.toLowerCase()) ||
        (i.category || '').toLowerCase().includes(registrySearch.toLowerCase())
      );
    }
    
    // Sorting
    result.sort((a, b) => {
      if (registrySort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (registrySort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (registrySort === 'stock') return (a.min_stock_level || 0) - (b.min_stock_level || 0);
      return 0;
    });

    // Grouping
    const groups: { [key: string]: any[] } = {};
    result.forEach(item => {
      let cat = item.category || 'UNCATEGORIZED';
      if (cat.toUpperCase() === 'RAW MATERIAL' || cat.toUpperCase() === 'RAW MATERIALS') cat = 'RAW MATERIALS';
      else if (cat.toUpperCase() === 'REAGENTS & STAINS') cat = 'REAGENTS & STAINS';
      else if (cat.toUpperCase() === 'CHEMICALS & BIOCHEMICALS') cat = 'CHEMICALS & BIOCHEMICALS';
      else cat = cat.toUpperCase();
      
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [items, registrySearch, registrySort]);

  const handleDeleteItem = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/inventory/items?id=${deletingId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setItems(items.filter(i => i.id !== deletingId));
      setStock(stock.filter(s => s.item_id !== deletingId));
      setDeletingId(null);
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDeleteItems = async () => {
    if (!selectedItemIds.size) return;
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedItemIds).join(',');
      const res = await fetch(`/api/inventory/items?ids=${ids}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems(prev => prev.filter(i => !selectedItemIds.has(i.id)));
      setStock(prev => prev.filter(s => !selectedItemIds.has(s.item_id)));
      setSelectedItemIds(new Set());
      setIsSelectMode(false);
      setShowBulkConfirm(false);
      toast.success(`${data.deleted} item(s) deleted.`);
    } catch (err: any) {
      toast.error('Bulk delete failed: ' + err.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleItemSelect = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
        toast.error(data.error || 'Upload failed');
      }
    } catch (err) {
      toast.error('Upload Error');
    } finally {
      if (type === 'coa') setUploadingCoA(false);
      else setUploadingSDS(false);
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (uploadingCoA || uploadingSDS) {
      toast.warn("Please wait for files to finish uploading.");
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
      } else { toast.error((await res.json()).error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleUpdateStock = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (uploadingCoA || uploadingSDS) {
      toast.warn("Please wait for files to finish uploading.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        ...newStock,
        current_quantity: newStock.received_quantity // reuse the input field logic
      };
      const res = await fetch('/api/inventory/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewStock({
          item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '',
          purchase_order_number: '', invoice_ref: '', condition_on_arrival: 'Good Condition', notes: '', sds_url: '', coa_url: ''
        });
        setPage(0); await fetchData(0, false);
      } else { toast.error((await res.json()).error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
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
      } else { toast.error((await res.json()).error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/items', {
        method: 'PUT',
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
      } else { toast.error((await res.json()).error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleUpdateVendor = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('vendors').update(newVendor as any).eq('id', (newVendor as any).id);
      if (!error) {
        setIsModalOpen(false);
        setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '', status: 'Approved' });
        fetchData(0, false);
      } else { toast.error(error.message || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleDeleteVendor = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      // Step 1: Null out any inventory_items that reference this vendor as preferred_supplier
      // This releases the FK constraint before we delete
      const { error: unlinkError } = await supabase
        .from('inventory_items')
        .update({ preferred_supplier: null })
        .eq('preferred_supplier', deletingId);
      if (unlinkError) throw unlinkError;

      // Step 2: Now safely delete the vendor
      const { error } = await supabase.from('vendors').delete().eq('id', deletingId);
      if (error) throw error;

      setVendors(vendors.filter(v => v.id !== deletingId));
      // Update items list to reflect unlinked suppliers
      setItems(items.map(i => i.preferred_supplier === deletingId ? { ...i, preferred_supplier: null } : i));
      setDeletingId(null);
    } catch (err: any) {
      toast.error('Failed to delete vendor: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await (supabase.from('vendors').insert([newVendor] as any) as any).select().single();
      if (!error) {
        setIsModalOpen(false);
        setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '', status: 'Approved' });
        fetchData(0, false);
      } else { toast.error(error.message || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleSeedCategories = async () => {
    setPendingSeed(true);
  };

  const executeSeed = async () => {
    setIsSubmitting(true);
    const catalogData: Record<string, string[]> = {
      "RAW MATERIALS": [
        "Ragi (Finger Millet)",
        "Karuppu Kavuni (Black Rice)",
        "Urad dal",
        "Agar Agar",
        "Beef Extract",
        "Peptone Bacteriological",
        "Yeast Extract",
        "MRS Broth",
        "LB Broth",
        "Nutrient Agar",
        "Nutrient Broth",
        "MacConkey Agar",
        "Mueller Hinton Agar",
        "Sabouraud Dextrose Agar",
        "MEM (Minimum Essential Medium)"
      ],
      "REAGENTS & STAINS": [
        "Aceto carmine",
        "Barfoed's reagent",
        "Bial's reagent",
        "Biuret reagent",
        "Bromocresol green solution",
        "Bromophenol blue indicator",
        "Bromophenol blue solution",
        "Cedar wood oil",
        "Chlorophenol red solution",
        "Crystal violet solution",
        "Ehrlich's reagent",
        "Gentian violet stain solution aqueous",
        "Giemsa's stain solution",
        "Indole-3 acetic acid",
        "Lactophenol",
        "Malachite green",
        "Methyl orange solution",
        "Methylene blue alkaline",
        "Methylene blue aqueous",
        "Methylene blue staining solution aqueous",
        "Molisch's reagent",
        "Morner's reagent",
        "Ninhydrin",
        "Phenol reagent (Folin-Ciocalteu)",
        "Phenolphthalein solution",
        "Picric acid saturated solution",
        "Pure linseed oil",
        "Robert's reagent",
        "Safranine stain solution",
        "Seliwanoff's reagent",
        "Tollen's reagent",
        "Trypan blue solution",
        "Wright's stain solution",
        "1,10 Phenanthroline hydrate",
        "3,5-Dinitrosalicylic acid (DNS)",
        "Albumin Bovine Fraction (BSA)",
        "Anthrone",
        "Egg albumine",
        "Egg albumine flakes",
        "Iodine Resublimed",
        "Kinetin pure",
        "L-Leucine",
        "Orcinol",
        "Proteinase K",
        "Pyridoxine hydrochloride",
        "Alizarin Red",
        "Benedict's Qualitative Reagent",
        "Carbon Fuchsin Strong",
        "Fehling's Solution I",
        "Fehling's Solution II",
        "Gower's Solution",
        "Hydrogen Peroxide",
        "Jenner's Stain",
        "Lactophenol Cotton Blue",
        "Leishman's Stain",
        "May-Grunwald's Eosin Methylene Blue Modified Solution",
        "Potassium Permanganate",
        "Silica Gel G",
        "Silica Gel G for TLC",
        "Silica Gel White",
        "Sodium Hypochlorite"
      ],
      "CHEMICALS & BIOCHEMICALS": [
        "Acetaldehyde",
        "Acetamide",
        "Acetanilide",
        "Acetic Acid",
        "Acetic Acid Glacial",
        "Acetone",
        "Acetyl Acetate",
        "Acrylamide",
        "Activated Charcoal",
        "Amyl Alcohol",
        "Benzaldehyde",
        "Benzoic Acid",
        "Carbon Tetrachloride",
        "Carboxymethyl Cellulose Sodium Salt",
        "Cetrimide",
        "Cetyltrimethyl Ammonium Bromide (CTAB)",
        "Cholesterol",
        "Citric Acid",
        "Cottonseed Oil",
        "Cyclohexanone",
        "D-Fructose",
        "D-Sorbitol Powder",
        "Dextrose Extra Pure",
        "Diacetyl Monoxime",
        "Dimethyl Sulfoxide (DMSO)",
        "Diphenylamine",
        "Fructose",
        "Formamide",
        "Gallic Acid",
        "Glutaraldehyde",
        "Glycerol",
        "Glycolic Acid 70%",
        "Hexane",
        "Hydroquinone",
        "Isoamyl Alcohol",
        "Lactose",
        "L-Ascorbic Acid (Vitamin C)",
        "Methanol",
        "Meso-Inositol",
        "Methyl Cellulose",
        "Naphthol",
        "Oxalic Acid",
        "Paraffin Liquid Colourless",
        "Paraffin Wax",
        "Perchloroethylene",
        "Petroleum Ether",
        "Petroleum Jelly Yellow",
        "Phthalic Acid",
        "Polyethylene Glycol (PEG)",
        "Polyvinylpyrrolidone K30 (PVP)",
        "Potassium Oxalate",
        "Propionic Acid",
        "Pyridine",
        "Salicylic Acid",
        "Sodium Alginate",
        "Sodium Benzoate",
        "Sodium Salicylate",
        "Sucrose",
        "Sulfuric Acid",
        "Synthetic Vinegar",
        "Tartaric Acid",
        "Urea",
        "Ammonium Acetate",
        "Ammonium Chloride",
        "Boric Acid",
        "Buffer Powder",
        "Buffer Tablets",
        "Dipotassium Hydrogen Orthophosphate",
        "Disodium Hydrogen Orthophosphate Anhydrous",
        "EDTA",
        "Hydrochloric Acid",
        "Hydrochloric Acid 35%",
        "Ortho Phosphoric Acid",
        "pH Standard 7",
        "Phosphate Buffer",
        "Potassium Acetate",
        "Potassium Bisulphate",
        "Potassium Carbonate Anhydrous",
        "Potassium Chloride",
        "Potassium Dihydrogen Orthophosphate",
        "Potassium Hydroxide Pellets",
        "Potassium Iodide",
        "Potassium Sodium Tartrate",
        "Potassium Sulphate",
        "Sodium Acetate",
        "Sodium Acetate Anhydrous",
        "Sodium Acetate Trihydrate",
        "Sodium Borate Alkaline Solution",
        "Sodium Carbonate Anhydrous",
        "Sodium Chloride",
        "Sodium Dihydrogen Orthophosphate",
        "Sodium Hydrogen Carbonate",
        "Sodium Hydroxide Pellets",
        "Sodium Iodide",
        "Sodium Lauryl Sulphate (SDS)",
        "Sodium Sulphate Anhydrous",
        "TEMED",
        "Titriplex III Pure (EDTA disodium salt)",
        "Tri-Ammonium Citrate",
        "Trisodium Citrate",
        "Tris Buffer",
        "Tris Hydrochloride",
        "Aluminium Chloride Anhydrous",
        "Aluminium Nitrate",
        "Aluminium Potassium Sulphate",
        "Ammonia",
        "Ammonium Ferrous Sulphate",
        "Ammonium Molybdate",
        "Ammonium Nitrate",
        "Ammonium Persulphate",
        "Barium Chloride",
        "Barium Nitrate",
        "Barium Sulphate",
        "Calcium Borate",
        "Calcium Carbonate",
        "Calcium Chloride",
        "Calcium Nitrate",
        "Copper Sulphate",
        "Cupric Nitrate",
        "Cupric Sulphate Pentahydrate",
        "Epsom Salt (MgSO4)",
        "Ferric Chloride Anhydrous",
        "Ferrous Sulphate",
        "Lead Acetate",
        "Magnesium Chloride",
        "Magnesium Phosphate",
        "Magnesium Sulphate",
        "Manganese Sulphate Monohydrate",
        "Manganous Chloride",
        "Nickel Chloride",
        "Nitric Acid",
        "Perchloric Acid 60%",
        "Perchloric Acid 70%",
        "Potassium Nitrate",
        "Sodium Nitrite",
        "Sodium Nitroprusside",
        "Sodium Sulphide Flakes",
        "Zinc Acetate",
        "Zinc Carbonate",
        "Zinc Chloride Anhydrous",
        "Zinc Sulphate",
        "Ficoll Type 400",
        "Tween 20",
        "Tween 80",
        "Folic Acid",
        "Glycine"
      ]
    };

    // Build a flat array of all items for a single bulk insert (much faster)
    const allItems: any[] = [];
    for (const [category, itemsList] of Object.entries(catalogData)) {
      for (const itemName of itemsList) {
        allItems.push({
          name: itemName, category, sub_category: '', unit: 'units', min_stock_level: 1,
          storage_condition: 'Room Temperature', preferred_supplier: null, hazardous: false,
          cold_chain_required: false, coa_required: false, allergen: false, organic_certified: '',
          item_code: `ITM-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
        });
      }
    }

    const instrumentsList = [
      "Autoclave",
      "Bio Chemical India – Fermentor (model: Bioage 2A)",
      "Scigenics – Fermentor",
      "Kemi – Laminar Air Flow",
      "Tech Lab Instruments – Incubator",
      "Technico – BOD Incubator",
      "Hybridization Oven – Scigenics Biotech",
      "Bino CXI – Microscope",
      "Remi – Clinical Centrifuge",
      "Remi – Cooling Centrifuge (Model 412 LAG)",
      "Remi – Micro Centrifuge (12C)",
      "Remi – R-8C Centrifuge",
      "Remi – Centrifuge (KA 6775)",
      "Deen Instruments – Magnetic Stirrer",
      "Remi – Cyclo Mixer",
      "Orbital Shaker – Scigenics Biotech",
      "Orbital Water Bath Shaker – Ind Labs",
      "Rotary Shaker – Ind Labs",
      "Rashmi – Water Bath",
      "Oil Bath",
      "Electronic Scale",
      "Weighing Machine (Electronic, Max 300 g)",
      "Precision Lab Furniture Industries – Hot Air Oven",
      "Golden / Butterfly – Stove",
      "Hot Plate",
      "Microwave Oven – Samsung",
      "LG – Refrigerator",
      "LG – Refrigerator (Model GL 328)",
      "Deep Freezer – Ins Lab",
      "Rockwell – Deep Freezer",
      "Rockwell – Deep Freezer (Model SFR450DDU)",
      "Ice Flake Machine",
      "Medox – pH Meter",
      "Borosil – Double Distillation Unit",
      "Labtronics – Digital Flame Photometer (LT 65)",
      "Alpha Infotech – Gel Documentation System",
      "Medox / Weal Tech – UV Transilluminator",
      "Labtronics – Microprocessor Colony Counter",
      "Rashmi Scientific Company – Soxhlet Apparatus",
      "Sonic Vibra Cell – Ultrasonicator",
      "Endee – Gas Analyser (PA960)",
      "Remi / Techno Instrument Co. – Homogeniser"
    ];

    try {
      // Single bulk insert for all inventory items
      const { error: invError } = await (supabase.from('inventory_items').insert(allItems as any) as any);
      if (invError && invError.code !== '23505') throw invError; // ignore duplicate key errors

      const { error: equipErr } = await (supabase.from('equipment').insert(
        instrumentsList.map(name => ({ name, status: 'Operational', model: 'Auto-Imported' }))
      ) as any);

      toast.success(`Auto-loaded ${allItems.length} inventory items and ${instrumentsList.length} instruments.`);
      fetchData(0, false);
    } catch(err) {
      toast.error("Error during seed process.");
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
      } else { toast.error((await res.json()).error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const [batchUsageMap, setBatchUsageMap] = useState<Record<string, Array<{id: string, batch_id: string}>>>({});
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');

  // --- Tab-aware stats ---
  const stockStats = useMemo(() => getStockStats(stock), [stock]);

  const itemStats = useMemo(() => getItemStats(items), [items]);

  const vendorStats = useMemo(() => ({
    total: vendors.length,
    withEmail: vendors.filter(v => v.email).length,
    withPhone: vendors.filter(v => v.phone).length,
    withLeadTime: vendors.filter(v => v.lead_time).length,
  }), [vendors]);

  // Legacy alias so filteredStock still compiles
  const stats = stockStats;

  const filteredStock = useMemo(() => filterStock(stock, stockFilter), [stock, stockFilter]);

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
      {/* Summary Strip â€” Tab Aware */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
        {activeTab === 'stock' && [
          { label: 'Total Items in Stock', count: stockStats.total, type: 'all', clickable: true },
          { label: 'Low Stock', count: stockStats.low, type: 'low', clickable: true },
          { label: 'Expiring (<30d)', count: stockStats.expiring, type: 'expiring', clickable: true },
          { label: 'Expired', count: stockStats.expired, type: 'expired', clickable: true },
        ].map(tile => (
          <button
            key={tile.type}
            onClick={() => setStockFilter(tile.type as StockFilter)}
            className={`p-4 rounded-xl border flex flex-col transition-all text-left ${
              stockFilter === tile.type
                ? 'bg-white border-slate-500 shadow-md ring-2 ring-slate-100'
                : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{tile.label}</span>
            <span className={`text-2xl font-black font-mono mt-1 ${
              tile.count > 0 && tile.type !== 'all' ? 'text-red-600' : 'text-slate-800'
            }`}>
              {tile.count}
            </span>
          </button>
        ))}

        {activeTab === 'items' && [
          { label: 'Total Registered', count: itemStats.total, highlight: false },
          { label: 'Hazardous Items', count: itemStats.hazardous, highlight: true },
          { label: 'Cold Chain Required', count: itemStats.coldChain, highlight: true },
          { label: 'CoA Required', count: itemStats.coaRequired, highlight: false },
        ].map(tile => (
          <div key={tile.label} className="p-4 rounded-xl border bg-white border-gray-100 flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{tile.label}</span>
            <span className={`text-2xl font-black font-mono mt-1 ${
              tile.highlight && tile.count > 0 ? 'text-amber-600' : 'text-slate-800'
            }`}>
              {tile.count}
            </span>
          </div>
        ))}

        {activeTab === 'vendors' && [
          { label: 'Total Suppliers', count: vendorStats.total, color: 'text-slate-800' },
          { label: 'Have Email', count: vendorStats.withEmail, color: 'text-slate-800' },
          { label: 'Have Phone', count: vendorStats.withPhone, color: 'text-slate-800' },
          { label: 'Lead Time Set', count: vendorStats.withLeadTime, color: vendorStats.withLeadTime < vendorStats.total ? 'text-amber-600' : 'text-slate-800' },
        ].map(tile => (
          <div key={tile.label} className="p-4 rounded-xl border bg-white border-gray-100 flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{tile.label}</span>
            <span className={`text-2xl font-black font-mono mt-1 ${tile.color}`}>{tile.count}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Inventory & Supply Chain</h1>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-1">O2B Global Traceability System</p>
        </div>
        <div className="flex gap-3 relative">
          {/* Context-aware Options dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowOptions(v => !v)}
              className="flex items-center px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition-all active:scale-95"
            >
              <Filter className="w-4 h-4 mr-2" /> Options
            </button>
            {showOptions && (
              <div className="absolute left-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden">
                {activeTab === 'stock' && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Stock</p>
                    {[['all','All Stock'],['low','Low Stock Only'],['expiring','Expiring (&lt;30d)'],['expired','Expired']].map(([val, label]) => (
                      <button key={val} onClick={() => { setStockFilter(val as StockFilter); setShowOptions(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors ${ stockFilter === val ? 'text-slate-700 bg-slate-50/60' : 'text-gray-700' }`}>
                        {label}
                      </button>
                    ))}
                  </>
                )}
                {activeTab === 'items' && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Sort Registry</p>
                    {[['name','Name (Aâ€“Z)'],['newest','Newest First'],['stock','By Min Stock Level']].map(([val, label]) => (
                      <button key={val} onClick={() => { setRegistrySort(val); setShowOptions(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors ${ registrySort === val ? 'text-slate-700 bg-slate-50/60' : 'text-gray-700' }`}>
                        {label}
                      </button>
                    ))}
                  </>
                )}
                {activeTab === 'vendors' && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Supplier Options</p>
                    <button onClick={() => { setRegistrySearch(''); setShowOptions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-slate-50 transition-colors">Clear Search</button>
                    <button onClick={() => { setRegistrySort('name'); setShowOptions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-slate-50 transition-colors">Sort Aâ€“Z</button>
                  </>
                )}
                <div className="border-t border-gray-100 mt-1 mb-1" />
                <button onClick={() => setShowOptions(false)} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-400 hover:bg-gray-50 transition-colors">Close</button>
              </div>
            )}
          </div>
          {canDo('inventory', 'edit') && activeTab === 'items' && (
            <button onClick={handleSeedCategories} className="flex items-center px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-900/20 hover:bg-amber-600 transition-all active:scale-95 mr-2">
              Auto-Load Catalog
            </button>
          )}
          {canEditItems && (
            <button onClick={() => { setModalType(activeTab); setIsModalOpen(true); }} className="flex items-center px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/20 hover:bg-slate-900 transition-all active:scale-95">
              <Plus className="w-4 h-4 mr-2" /> {activeTab === 'stock' ? 'Receive New Stock' : activeTab === 'items' ? 'Register Item' : 'Add Supplier AVL'}
            </button>
          )}
        </div>
      </div>

      {syncError && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-black">Inventory sync failed</p>
              <p className="text-xs font-semibold text-red-600">{syncError}</p>
            </div>
          </div>
          <button
            onClick={() => fetchData(0, false)}
            className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-black uppercase tracking-widest text-red-700 shadow-sm hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('stock')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'stock' ? 'border-slate-600 text-slate-900 bg-slate-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Stock Log</button>
        <button onClick={() => setActiveTab('items')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'items' ? 'border-slate-600 text-slate-900 bg-slate-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Item Registry</button>
        <button onClick={() => setActiveTab('vendors')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'vendors' ? 'border-slate-600 text-slate-900 bg-slate-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Suppliers (AVL)</button>
        <button onClick={() => setActiveTab('pr')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'pr' ? 'border-slate-600 text-slate-900 bg-slate-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Purchase Requests</button>
        <button onClick={() => setActiveTab('traceability')} className={`px-8 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'traceability' ? 'border-slate-600 text-slate-900 bg-slate-50/30' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Traceability</button>
      </div>

      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by item name or lot number..."
            className="block w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm focus:ring-4 focus:ring-slate-50 focus:border-slate-500 font-bold transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={stockSort}
            onChange={(e) => setStockSort(e.target.value)}
            className="px-4 py-4 rounded-2xl bg-white border border-gray-200 text-xs font-bold focus:ring-4 focus:ring-slate-50 focus:border-slate-500 shadow-sm"
          >
            <option value="expiry">Sort: Nearest Expiry</option>
            <option value="name">Sort: Name (A-Z)</option>
            <option value="quantity_asc">Sort: Quantity (Low to High)</option>
            <option value="quantity_desc">Sort: Quantity (High to Low)</option>
            <option value="newest">Sort: Newest Added</option>
          </select>
          <button 
            onClick={() => {
              const code = prompt('Scan QR Code (or type ID manually):');
              if (code) {
                const id = code.replace('OXY-STOCK-', '');
                const s = stock.find(x => x.id === id);
                if (s) setSelectedStock(s);
                else toast.error('Stock item not found from QR code');
              }
            }}
            className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shrink-0"
          >
            <QrCode className="w-5 h-5" /> Scan
          </button>
        </div>
      </div>

      {activeTab === 'stock' && (
        <div className="grid grid-cols-1 gap-4">

          {filteredStock.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center gap-4">
              <Package className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">{getStockFilterLabel(stockFilter)}</p>
                <p className="text-xs font-bold text-gray-400 mt-1">
                  {stockFilter === 'all' ? 'Tap Receive New Stock to log your first shipment' : 'Adjust the filter or search to see more records'}
                </p>
              </div>
              {canDo('inventory', 'edit') && (
                <button onClick={() => { 
                   setNewStock({ 
                    item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '',
                    purchase_order_number: '', invoice_ref: '', condition_on_arrival: 'Good Condition', notes: '', sds_url: '', coa_url: '' 
                  });
                   setModalType('stock'); setIsModalOpen(true); 
                }} className="mt-2 flex items-center px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-900 transition-all">
                  Receive Stock
                </button>
              )}
            </div>
          ) : (
            Object.entries(
              filteredStock.reduce((acc: Record<string, any[]>, s: any) => {
                let cat = s.inventory_items?.category || 'UNCATEGORIZED';
                if (cat.toUpperCase() === 'RAW MATERIAL' || cat.toUpperCase() === 'RAW MATERIALS') cat = 'RAW MATERIALS';
                else if (cat.toUpperCase() === 'REAGENTS & STAINS') cat = 'REAGENTS & STAINS';
                else if (cat.toUpperCase() === 'CHEMICALS & BIOCHEMICALS') cat = 'CHEMICALS & BIOCHEMICALS';
                else cat = cat.toUpperCase();
                
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(s);
                return acc;
              }, {})
            ).sort(([a],[b]) => a.localeCompare(b)).map(([category, catStock]) => (
              <div key={category} className="space-y-4 pb-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="h-px flex-1 bg-gray-100"></div>
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-800 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                    {category} ({catStock.length})
                  </h2>
                  <div className="h-px flex-1 bg-gray-100"></div>
                </div>
                {catStock.map((s: any) => {
                  const risk = getStockRisk(s);
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedStock(s)}
                      className={`bg-white rounded-xl border ${risk.isExpired ? 'border-red-200 bg-red-50/30' : 'border-gray-100'} px-4 py-3 hover:shadow-sm hover:border-slate-100 transition-all flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 group cursor-pointer`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${category === 'RAW MATERIALS' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                            {category}
                          </span>
                          {(risk.isExpired || risk.isExpiring || risk.isLow) && (
                            <span className={`flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${risk.isExpired || risk.isOut ? 'bg-red-100 text-red-700' : risk.isLow ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                              <AlertTriangle className="w-3 h-3 mr-1" /> {risk.isOut ? 'Out of Stock' : risk.isExpired ? 'Expired' : risk.isLow ? 'Low Stock' : 'Near Expiry'}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-black text-slate-950 mb-0.5 leading-tight">{s.inventory_items?.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <Truck className="w-3.5 h-3.5 mr-1.5" /> Lot: <span className="text-slate-900 ml-1">{s.supplier_batch_number || 'N/A'}</span>
                          </div>
                          <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <MapPin className="w-3.5 h-3.5 mr-1.5" /> Loc: <span className="text-slate-900 ml-1">{s.location || 'Central Store'}</span>
                          </div>
                          <div className="flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <Calendar className="h-3.5 w-3.5 mr-1.5" /> Expiry: <span className={`ml-1 ${risk.isExpired ? 'text-red-600' : 'text-slate-900'}`}>{s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row items-center gap-3 sm:gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Balance</p>
                          <p className={`text-base font-black font-mono ${risk.isOut ? 'text-gray-300' : risk.isLow ? 'text-amber-700' : 'text-slate-800'}`}>
                            {s.current_quantity}<span className="text-[10px] ml-0.5">{s.inventory_items?.unit}</span>
                          </p>
                          {risk.minLevel > 0 && (
                            <p className="text-[9px] font-bold uppercase text-gray-400">min {risk.minLevel}{s.inventory_items?.unit}</p>
                          )}
                        </div>
                        <div className="hidden sm:block text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Vendor</p>
                          <p className="text-xs font-black text-gray-700 max-w-[100px] truncate">{s.vendors?.name || 'Local supplier'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setSelectedStock(s); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-800 border border-slate-100 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all whitespace-nowrap"
                        >
                          Details <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    {batchUsageMap[s.id]?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-3 mt-1 border-t border-gray-50">
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Used in:</span>
                        {batchUsageMap[s.id].map(b => (
                          <Link
                            key={b.id}
                            href={`/batches/${b.id}`}
                            onClick={e => e.stopPropagation()}
                            className="px-2 py-0.5 bg-slate-50 text-slate-700 text-[10px] font-black rounded border border-slate-100 hover:bg-slate-100 transition-colors"
                          >
                            {b.batch_id}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            ))
          )}
          
          {loading ? (
            <div className="space-y-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-3xl"/>)}
            </div>
          ) : hasMore && (
            <div className="pt-4 flex justify-center">
              <button 
                onClick={loadMore}
                disabled={loading}
                className="px-8 py-3 bg-white border border-slate-100 text-slate-800 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                Load More Records
              </button>
            </div>
          )}
        </div>
      )}

      {/* Item Registry Tab */}
      {activeTab === 'items' && (
        <div className="space-y-8">
          {/* Registry Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, code, or category..."
                value={registrySearch}
                onChange={(e) => setRegistrySearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-slate-600 text-sm font-bold"
              />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">Sort By</span>
              <select
                value={registrySort}
                onChange={(e) => setRegistrySort(e.target.value)}
                className="px-4 py-2.5 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-200 text-xs font-bold focus:ring-2 focus:ring-slate-600"
              >
                <option value="name">Alphabetical (A-Z)</option>
                <option value="newest">Newest Added</option>
                <option value="stock">Min Stock Level</option>
              </select>
              {isAdmin && (
                isSelectMode ? (
                  <div className="flex items-center gap-2">
                    {selectedItemIds.size > 0 && (
                      <button
                        onClick={() => setShowBulkConfirm(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedItemIds.size})
                      </button>
                    )}
                    <button
                      onClick={() => { setIsSelectMode(false); setSelectedItemIds(new Set()); }}
                      className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSelectMode(true)}
                    className="px-4 py-2.5 bg-gray-50 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest ring-1 ring-gray-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 transition-all"
                  >
                    Select
                  </button>
                )
              )}
            </div>
          </div>

          {Object.keys(filteredRegistry).length === 0 ? (
            <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-gray-200 flex flex-col items-center gap-4">
              <Package className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No matching items found</p>
                <p className="text-xs font-bold text-gray-400 mt-1">Adjust your search or register new items</p>
              </div>
            </div>
          ) : (
            Object.entries(filteredRegistry).sort(([a],[b]) => a.localeCompare(b)).map(([category, catItems]) => (
              <div key={category} className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="h-px flex-1 bg-gray-100"></div>
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-800 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                    {category} ({catItems.length})
                  </h2>
                  <div className="h-px flex-1 bg-gray-100"></div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      onClick={isSelectMode ? () => toggleItemSelect(item.id) : undefined}
                      className={`bg-white rounded-xl border px-3 py-2.5 relative group overflow-hidden transition-all hover:shadow-sm ${
                        isSelectMode ? 'cursor-pointer' : ''
                      } ${selectedItemIds.has(item.id) ? 'border-red-400 ring-2 ring-red-200 bg-red-50/30' : 'border-gray-100 hover:border-slate-100'}`}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500">{item.sub_category || 'General'}</span>
                        {isSelectMode ? (
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedItemIds.has(item.id) ? 'bg-red-600 border-red-600' : 'border-gray-300 bg-white'}`}>
                            {selectedItemIds.has(item.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {(item as any).creator && (
                              <CreatorBadge initials={(item as any).creator.initials} fullName={(item as any).creator.full_name} size="sm" />
                            )}
                            {isAdmin ? (
                              <>
                                <button
                                  onClick={() => { setNewItem({...item}); setModalType('edit_item'); setIsModalOpen(true); }}
                                  className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-slate-50 hover:text-slate-600 transition-all border border-gray-200 shadow-sm">
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setDeleteType('item'); setDeletingId(item.id); }}
                                  className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all border border-gray-200 shadow-sm">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (item as any).created_by === employeeProfile?.id ? (
                              <EditRequestButton
                                tableName="inventory_items"
                                recordId={item.id}
                                moduleLabel="Inventory Item"
                                fields={[
                                  { key: 'name',              label: 'Item Name',         type: 'text' },
                                  { key: 'category',          label: 'Category',          type: 'text' },
                                  { key: 'sub_category',      label: 'Sub-Category',      type: 'text' },
                                  { key: 'unit',              label: 'Unit',              type: 'text' },
                                  { key: 'min_stock_level',   label: 'Min Reorder Level', type: 'number' },
                                  { key: 'storage_condition', label: 'Storage Condition', type: 'text' },
                                  { key: 'item_code',         label: 'Item Code',         type: 'text' },
                                ]}
                                currentData={item}
                                hasPending={pendingIds.has(item.id)}
                                allowDelete
                                onSuccess={() => fetchData(0, false)}
                              />
                            ) : canEditItems ? (
                              <button
                                onClick={() => { setNewItem({...item}); setModalType('edit_item'); setIsModalOpen(true); }}
                                className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-slate-50 hover:text-slate-600 transition-all border border-gray-200 shadow-sm">
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                      
                      <h3 className="text-xs font-black text-slate-950 leading-tight">{item.name}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                        {item.unit}{(item as any).hazardous && <span className="ml-1 text-orange-500">⚠</span>}
                      </p>
                      <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between gap-1">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Stock</p>
                          <p className="text-xs font-black text-slate-800">{item.min_stock_level || '0'} {item.unit}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Code</p>
                          <p className="text-[10px] font-mono font-bold text-gray-500 truncate max-w-[72px]">{item.item_code || '---'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-red-950/20 backdrop-blur-md">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2.5rem] p-6 md:p-5 md:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Delete {selectedItemIds.size} Items?</h2>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              This will permanently remove {selectedItemIds.size} item(s) and all their associated stock records. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteItems}
                disabled={isBulkDeleting}
                className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isBulkDeleting ? 'Deleting...' : `Delete ${selectedItemIds.size} Items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-red-950/20 backdrop-blur-md">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2.5rem] p-6 md:p-5 md:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Delete Record?</h2>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              {deleteType === 'item' 
                ? "This will permanently remove the item and all its associated stock records. This action cannot be undone."
                : "This will remove the supplier from your Approved Vendor List (AVL)."}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteType === 'item' ? handleDeleteItem() : handleDeleteVendor()}
                disabled={isDeleting}
                className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-700 shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Deletion"}
              </button>
            </div>
          </div>
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
                <button onClick={() => { setModalType('vendors'); setIsModalOpen(true); }} className="mt-2 flex items-center px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-900 transition-all">
                  Add Supplier
                </button>
              )}
            </div>
          ) : vendors.map(vendor => (
            <div key={vendor.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-all flex gap-2">
                 {canEditItems && (
                    <button
                      onClick={() => { setNewVendor({...vendor}); setModalType('edit_vendor'); setIsModalOpen(true); }}
                      className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-slate-50 hover:text-slate-600 transition-all border border-gray-200 shadow-sm">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                 )}
                 {isAdmin && (
                    <button
                      onClick={() => { setDeleteType('vendor'); setDeletingId(vendor.id); }}
                      className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all border border-gray-200 shadow-sm">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                 )}
              </div>
              <h3 className="text-lg font-black text-slate-950">{vendor.name}</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{vendor.contact_person || 'No Contact'}</p>
              <div className="mt-4 pt-4 border-t border-gray-50 space-y-2">
                <p className="text-xs font-bold text-gray-600 flex items-center gap-2"><ExternalLink className="w-3 h-3"/> {vendor.email || 'No email'}</p>
                <div className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded inline-block ${
                  vendor.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                  vendor.status === 'Conditional' ? 'bg-amber-50 text-amber-700' :
                  vendor.status === 'Blacklisted' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'
                }`}>
                  {vendor.status || 'Approved'} Supplier
                </div>
                {/* A-09: Vendor qualification badge */}
                <div className={`ml-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded inline-block ${
                  vendor.qualification_status === 'Approved' ? 'bg-blue-50 text-blue-700' :
                  vendor.qualification_status === 'Under Review' ? 'bg-amber-50 text-amber-700' :
                  vendor.qualification_status === 'Suspended' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {vendor.qualification_status || 'Unqualified'} (AVL)
                </div>
                {vendor.audit_due_date && new Date(vendor.audit_due_date) < new Date() && (
                  <p className="text-[9px] text-red-600 font-bold mt-1">⚠ Vendor audit overdue since {new Date(vendor.audit_due_date).toLocaleDateString('en-IN')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Requests Tab */}
      {activeTab === 'pr' && (
        <div className="mt-6">
          <PurchaseRequestsTab canApprove={canEditItems} />
        </div>
      )}

      {/* Traceability Tab */}
      {activeTab === 'traceability' && (
        <div className="mt-6">
          <TraceabilityTab />
        </div>
      )}

      {/* Unified Modal Shell */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] md:animate-in fade-in zoom-in duration-200">
            <div className="px-5 py-4 sm:px-6 sm:py-5 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-800">
                  {modalType === 'stock' ? 'Receive Warehouse Shipment' : modalType === 'edit_stock' ? 'Edit Stock Log' : modalType === 'items' ? 'Register Raw Material' : modalType === 'edit_item' ? 'Edit Raw Material' : modalType === 'edit_vendor' ? 'Edit Supplier' : 'Register Approved Supplier'}
                </h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                  {modalType === 'stock' ? 'Digital Material Input (DMI)' : modalType === 'items' ? 'BOM Registry updates' : 'Suppliers List update'}
                </p>
              </div>
              {modalType === 'stock' && !trainingStatus.isTrained && !['admin', 'research_fellow', 'scientist'].includes(role) && <AlertTriangle className="w-5 h-5 text-amber-500 font-black animate-pulse" />}
            </div>

            {/* Stock / Issue forms */}
            {['stock', 'edit_stock', 'issue'].includes(modalType) ? (
              <StockModal
                modalType={modalType} items={items} vendors={vendors} stock={stock}
                newStock={newStock} setNewStock={setNewStock}
                newIssue={newIssue} setNewIssue={setNewIssue}
                isSubmitting={isSubmitting} uploadingCoA={uploadingCoA} uploadingSDS={uploadingSDS}
                trainingStatus={trainingStatus} role={role}
                handleAddStock={handleAddStock} handleUpdateStock={handleUpdateStock}
                handleIssueStock={handleIssueStock} handleFileChange={handleFileChange}
                onClose={() => setIsModalOpen(false)}
              />
            ) : (
              /* Item / Vendor forms */
              <ItemVendorModal
                modalType={modalType} vendors={vendors}
                newItem={newItem} setNewItem={setNewItem}
                newVendor={newVendor} setNewVendor={setNewVendor}
                isSubmitting={isSubmitting}
                handleAddItem={handleAddItem} handleUpdateItem={handleUpdateItem}
                handleAddVendor={handleAddVendor} handleUpdateVendor={handleUpdateVendor}
                onClose={() => setIsModalOpen(false)}
              />
            )}
          </div>
        </div>
      )}
      {/* Stock Item Detail Modal (Section 2.4) */}
      {selectedStock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl rounded-none sm:rounded-2xl bg-white h-[100dvh] sm:h-auto sm:max-h-[90vh] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 bg-gray-50 border-b border-gray-100 relative shrink-0">
              <div className="absolute top-5 right-14 flex items-center gap-2">
                {canDo('inventory', 'edit') && (
                  <button onClick={() => { 
                    setNewStock({ 
                      ...selectedStock, 
                      vendor_id: selectedStock.vendor_id || selectedStock.vendors?.id || '', 
                      received_quantity: selectedStock.current_quantity,
                      expiry_date: selectedStock.expiry_date ? selectedStock.expiry_date.split('T')[0] : '' 
                    });
                    setModalType('edit_stock');
                    setIsModalOpen(true);
                    setSelectedStock(null);
                  }} className="p-1.5 rounded-lg bg-white border border-gray-200 text-slate-600 hover:bg-gray-100 transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                    <Edit3 className="w-4 h-4"/> Edit
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedStock(null)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-200 rounded-lg transition-all"><X className="w-5 h-5"/></button>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600">{selectedStock.inventory_items?.category}</span>
              <h2 className="text-xl font-black font-mono tracking-tighter mt-1 text-slate-800">{selectedStock.inventory_items?.name}</h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Lot: {selectedStock.supplier_batch_number || 'N/A'}</p>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Available Balance</p>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">{selectedStock.current_quantity} <span className="text-xs">{selectedStock.inventory_items?.unit}</span></p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Expiry Date</p>
                  <p className={`text-lg font-black mt-1 ${selectedStock.expiry_date && new Date(selectedStock.expiry_date) < new Date() ? 'text-red-600' : 'text-slate-800'}`}>
                    {selectedStock.expiry_date ? new Date(selectedStock.expiry_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Storage Deviation Alerts */}
              {selectedStock.condition_on_arrival === 'Temperature Deviation' && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                  <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-red-900 uppercase tracking-widest">Temperature Deviation Alert</h4>
                    <p className="text-xs font-bold text-red-700 mt-1">This lot was received with a temperature deviation. Ensure QC re-testing is completed before issuing.</p>
                  </div>
                </div>
              )}

              {/* Advanced Specs */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-widest">Storage & Location</h4>
                <div className="bg-white border border-slate-100 rounded-xl p-4 divide-y divide-slate-50">
                  <div className="flex justify-between py-2 text-sm">
                    <span className="font-bold text-slate-400">Warehouse Location</span>
                    <span className="font-black text-slate-800">{selectedStock.location || 'Central Store'}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="font-bold text-slate-400">Condition on Arrival</span>
                    <span className="font-black text-slate-800">{selectedStock.condition_on_arrival || 'Good'}</span>
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
                          <p className="font-black text-slate-800">{m.type === 'Receive' ? 'Stock Input' : 'Stock Issue'}</p>
                          <p className="text-slate-400 font-bold mt-0.5">{new Date(m.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black ${m.type === 'Receive' ? 'text-green-600' : 'text-red-600'}`}>
                            {m.type === 'Receive' ? '+' : '-'}{m.quantity}
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
                    <FileText className="w-4 h-4 text-slate-600"/> View CoA
                  </a>
                )}
                {selectedStock.sds_url && (
                  <a href={selectedStock.sds_url} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <FileText className="w-4 h-4 text-amber-600"/> View SDS
                  </a>
                )}
              </div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => setShowQR(true)} 
                  className="flex-1 py-4 bg-gray-100 text-gray-700 font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-sm hover:bg-gray-200 transition-all text-center flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4" /> View QR
                </button>
                {selectedStock.status === 'Quarantined' || selectedStock.qc_status === 'Quarantine' ? (
                  <button
                    onClick={async () => {
                       const qcNotes = window.prompt('QC Release Notes (identity test result, sampling method, observations):');
                       if (qcNotes === null) return; // user cancelled
                       const { data: { user } } = await supabase.auth.getUser();
                       const { data: emp } = await supabase.from('employees').select('id').eq('email', user?.email || '').maybeSingle();
                       const { error } = await supabase.from('inventory_stock').update({
                         status: 'Available',
                         qc_status: 'Released',
                         qc_released_by: emp?.id || null,
                         qc_released_at: new Date().toISOString(),
                         qc_notes: qcNotes || null,
                       }).eq('id', selectedStock.id);
                       if (!error) {
                         toast.success('Stock QC Released — status updated to Available');
                         setSelectedStock({...selectedStock, status: 'Available', qc_status: 'Released'});
                         fetchData(0, false);
                       } else {
                         toast.error(error.message);
                       }
                    }}
                    className="flex-[2] py-4 bg-amber-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-amber-600 transition-all text-center"
                  >
                    ✓ QC Release (Quarantine → Available)
                  </button>
                ) : selectedStock.qc_status === 'Rejected' ? (
                  <div className="flex-[2] py-3 bg-red-50 border border-red-200 rounded-2xl text-center text-[10px] font-black text-red-700">
                    REJECTED — {selectedStock.rejection_reason || 'No reason recorded'}
                  </div>
                ) : (
                  <button 
                    onClick={() => {
                      setNewIssue({ stock_id: selectedStock.id, quantity_issued: '', purpose: 'Production Use', notes: '', batch_reference: '' });
                      setModalType('issue');
                      setIsModalOpen(true);
                      setSelectedStock(null);
                    }} 
                    className="flex-[2] py-4 bg-slate-800 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-slate-900 transition-all text-center"
                  >
                    Issue Stock Out
                  </button>
                )}
              </div>

              {/* A-08: AQL Sampling Plan */}
              {selectedStock.received_quantity && (
                <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-xl text-[10px]">
                  <p className="font-black text-indigo-800 uppercase mb-0.5">A-08 AQL Level II Incoming Sample Guide</p>
                  <p className="text-indigo-700 font-semibold">
                    Lot qty: {selectedStock.received_quantity} → Sample: {Math.max(1, Math.round(parseFloat(String(selectedStock.received_quantity)) * 0.1))} units · Accept ≤0 defects · Reject ≥1
                  </p>
                </div>
              )}

              {/* A-46: Quarantine location + A-47: Rejection + A-45: CoA verification */}
              {(selectedStock.status === 'Quarantined' || selectedStock.qc_status === 'Quarantine') && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-black text-gray-500 uppercase">A-46 Quarantine Location</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      defaultValue={selectedStock.quarantine_location || ''}
                      placeholder="Storage location (e.g. QC Cage 1)"
                      className="px-2 py-1.5 border border-amber-200 rounded-lg text-xs font-semibold outline-none bg-amber-50"
                      onBlur={async (e) => {
                        await supabase.from('inventory_stock').update({ quarantine_location: e.target.value || null }).eq('id', selectedStock.id);
                      }}
                    />
                    <input
                      defaultValue={selectedStock.quarantine_rack || ''}
                      placeholder="Rack / shelf"
                      className="px-2 py-1.5 border border-amber-200 rounded-lg text-xs font-semibold outline-none bg-amber-50"
                      onBlur={async (e) => {
                        await supabase.from('inventory_stock').update({ quarantine_rack: e.target.value || null }).eq('id', selectedStock.id);
                      }}
                    />
                  </div>
                  {/* A-45: CoA verification */}
                  <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-[10px] font-black text-blue-800">A-45 CoA Verified</span>
                    <input type="checkbox"
                      defaultChecked={!!selectedStock.coa_url}
                      onChange={async (e) => {
                        if (!e.target.checked) return;
                        const url = window.prompt('Enter CoA document URL (from supplier):');
                        if (!url) { e.target.checked = false; return; }
                        await supabase.from('inventory_stock').update({ coa_url: url }).eq('id', selectedStock.id);
                        setSelectedStock({ ...selectedStock, coa_url: url });
                        toast.success('CoA URL saved.');
                      }}
                      className="w-4 h-4 rounded border-blue-300"
                    />
                  </div>
                  {/* A-47: Rejection workflow */}
                  <button
                    className="w-full py-2 bg-red-50 border border-red-200 text-red-700 font-black rounded-xl text-[10px] uppercase tracking-wider hover:bg-red-100"
                    onClick={async () => {
                      const reason = window.prompt('Rejection reason (failed identity test, contamination, CoA mismatch, etc.):');
                      if (!reason) return;
                      const { data: { user } } = await supabase.auth.getUser();
                      const { data: emp } = await supabase.from('employees').select('id').eq('email', user?.email || '').maybeSingle();
                      const { error } = await supabase.from('inventory_stock').update({
                        status: 'Discarded',
                        qc_status: 'Rejected',
                        rejection_reason: reason,
                        rejected_at: new Date().toISOString(),
                        rejected_by: emp?.id || null,
                      }).eq('id', selectedStock.id);
                      if (!error) {
                        toast.success('Lot rejected and marked as Discarded.');
                        setSelectedStock(null);
                        fetchData(0, false);
                      } else { toast.error(error.message); }
                    }}
                  >
                    ✗ Reject Lot (A-47)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && selectedStock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1200] flex items-center justify-center p-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-black text-slate-800 mb-2 text-center">Stock QR Code</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 text-center">{selectedStock.inventory_items?.name}</p>
            <div className="bg-white p-4 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.05)] border border-slate-100 mb-6">
              <QRCodeSVG value={`OXY-STOCK-${selectedStock.id}`} size={200} level="M" />
            </div>
            <p className="text-xs font-mono font-medium text-slate-400">ID: {selectedStock.id}</p>
          </div>
        </div>
      )}

      {/* Auto-Load Modal */}
      {pendingSeed && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Auto-Load Inventory Catalog</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              This will automatically load 115 standard inventory items and common lab equipment into the system. Perfect for initial setup. Proceed?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingSeed(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setPendingSeed(false);
                  executeSeed();
                }}
                disabled={isSubmitting}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition w-full shadow-lg shadow-amber-500/30"
              >
                âœ“ Load Catalog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
