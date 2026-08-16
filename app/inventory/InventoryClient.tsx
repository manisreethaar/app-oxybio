// @ts-nocheck
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Package, AlertTriangle, Search, Plus, Calendar, Truck, Loader2, Filter, X, FileText, Trash2, Edit3, QrCode, LayoutGrid, Columns, Table as TableIcon, Boxes, FlaskConical, Beaker, Clock, Ban, Flame, Snowflake, FileCheck2, Mail, Phone, ClipboardList, Workflow, Sparkles, CheckCircle2, Database, ChevronDown } from 'lucide-react';
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
import { useAuditReason } from '@/components/useAuditReason';
import { getStockRisk } from './inventoryUtils';
import {
  filterStock,
  getItemStats,
  getStockFilterLabel,
  getStockStats,
  type StockFilter,
} from './inventoryUtils';
import { useData } from '@/lib/hooks/useData';

// Icon per category, used across the stock grid, kanban board, item registry and
// section dividers to make categories scannable — kept to the app's existing
// slate/gray palette rather than introducing new colors.
const CATEGORY_META: Record<string, { icon: any; accent: string; chip: string; bar: string }> = {
  'RAW MATERIALS':             { icon: Boxes,        accent: 'text-slate-600', chip: 'bg-slate-50 text-slate-800 border-slate-100', bar: 'bg-slate-600' },
  'REAGENTS & STAINS':         { icon: FlaskConical,  accent: 'text-slate-600', chip: 'bg-slate-50 text-slate-800 border-slate-100', bar: 'bg-slate-600' },
  'CHEMICALS & BIOCHEMICALS':  { icon: Beaker,        accent: 'text-slate-600', chip: 'bg-slate-50 text-slate-800 border-slate-100', bar: 'bg-slate-600' },
};
const DEFAULT_CATEGORY_META = { icon: Package, accent: 'text-slate-600', chip: 'bg-slate-50 text-slate-800 border-slate-100', bar: 'bg-slate-600' };
function getCategoryMeta(category?: string) {
  return CATEGORY_META[(category || '').toUpperCase()] || DEFAULT_CATEGORY_META;
}

export default function InventoryClient({ initialStock, initialItems, initialVendors, initialSearch = '' }: { initialStock: any[], initialItems: any[], initialVendors: any[], initialSearch?: string }) {
  const { requestReason, modal: auditModal } = useAuditReason();
  const { user, role, isAdmin, canDo, employeeProfile, loading: authLoading } = useAuth() as any;
  const canEditItems = ['admin', 'ceo', 'cto', 'research_fellow', 'scientist'].includes(role) || isAdmin;
  const toast = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('stock');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('inventory_view_mode') || 'stock';
    return 'stock';
  });
  const [inlineContext, setInlineContext] = useState<string | null>(null);

  const handleViewModeChange = (mode: string) => {
    setViewMode(mode);
    localStorage.setItem('inventory_view_mode', mode);
  };
  
  const [stock, setStock] = useState(initialStock || []);
  const [items, setItems] = useState(initialItems || []);
  const [vendors, setVendors] = useState(initialVendors || []);
  
  useInventoryRealtime();

  useEffect(() => {
    setStock(initialStock || []);
    setItems(initialItems || []);
    setVendors(initialVendors || []);
  }, [initialStock, initialItems, initialVendors]);

  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialSearch || '');
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
  const [isSelectMode, setIsSelectMode] = useState(false);
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

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const checkTraining = useCallback(async (signal: AbortSignal) => {
    if (role === 'admin') {
      setTrainingStatus({ isTrained: true });
      return;
    }
    setCheckingTraining(true);
    try {
      const res = await fetch(`/api/training/check?employeeId=${employeeProfile.id}&category=Sanitation`, { signal });
      const data = await res.json();
      setTrainingStatus(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error("Training check failed:", err);
    } finally {
      setCheckingTraining(false);
    }
  }, [role, employeeProfile]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    if (employeeProfile) {
      checkTraining(controller.signal);
      fetch('/api/edit-request').then(r => r.ok ? r.json() : null).then(d => {
        if (d?.data && mounted) {
          setPendingIds(new Set(d.data.filter((r: any) => r.status === 'pending').map((r: any) => r.record_id)));
        }
      });
    }

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [employeeProfile, checkTraining]);

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
      toast.success("Item deleted successfully.");
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
    // GDP: correcting an existing stock record requires a reason + e-signature,
    // same as QC release/reject — captured via the shared AuditReasonModal.
    const auditResult = await requestReason().catch(() => null);
    if (!auditResult) return;
    setIsSubmitting(true);
    try {
      const payload = {
        ...newStock,
        current_quantity: newStock.received_quantity, // reuse the input field logic
        reason: auditResult.reason,
        pin: auditResult.pin,
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
      const json = await res.json();
      if (res.ok && json.success) {
        setNewItem({ 
          name: '', category: 'Raw Material', sub_category: '', unit: '', min_stock_level: '', 
          storage_condition: 'Room Temperature', preferred_supplier: '', hazardous: false, cold_chain_required: false, 
          coa_required: false, allergen: false, organic_certified: '', item_code: '' 
        });
        await fetchData(0, false);
        if (inlineContext === 'stock') {
          if (json.data?.id) setNewStock(prev => ({ ...prev, item_id: json.data.id }));
          setModalType('stock');
          setInlineContext(null);
          toast.success("Item registered! Continuing stock receipt...");
        } else {
          setIsModalOpen(false);
          toast.success("Item registered successfully.");
        }
      } else { toast.error(json.error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    // GDP: correcting an existing item record requires a reason + e-signature.
    const auditResult = await requestReason().catch(() => null);
    if (!auditResult) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, reason: auditResult.reason, pin: auditResult.pin })
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

  // Handle Smart Receive Flow Triggers
  useEffect(() => {
    if (newStock.item_id === 'CREATE_NEW_ITEM') {
      setNewStock(prev => ({ ...prev, item_id: '' }));
      setInlineContext('stock');
      setModalType('items');
    }
    if (newStock.vendor_id === 'CREATE_NEW_VENDOR') {
      setNewStock(prev => ({ ...prev, vendor_id: '' }));
      setInlineContext('stock');
      setModalType('vendors');
    }
  }, [newStock.item_id, newStock.vendor_id]);

  useEffect(() => {
    if (!isModalOpen) {
      setNewStock({
        item_id: '', vendor_id: '', supplier_batch_number: '', received_quantity: '', expiry_date: '', location: '',
        purchase_order_number: '', invoice_ref: '', condition_on_arrival: 'Good Condition', notes: '', sds_url: '', coa_url: ''
      });
      setNewIssue({ stock_id: '', quantity_issued: '', purpose: 'Production Use', notes: '', batch_reference: '' });
      setNewItem({
        name: '', category: 'Raw Material', sub_category: '', unit: '', min_stock_level: '',
        storage_condition: 'Room Temperature', preferred_supplier: '', hazardous: false, cold_chain_required: false,
        coa_required: false, allergen: false, organic_certified: '', item_code: ''
      });
      setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '', status: 'Approved' });
      setInlineContext(null);
    }
  }, [isModalOpen]);

  const handleUpdateVendor = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/vendors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVendor)
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsModalOpen(false);
        setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '', status: 'Approved' });
        toast.success("Vendor updated successfully.");
        fetchData(0, false);
      } else { toast.error(json.error || 'Failed.'); }
    } catch (err) { toast.error("Network Error"); } finally { setIsSubmitting(false); }
  };

  const handleDeleteVendor = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      // Archiving (soft delete) + unlinking preferred_supplier now both
      // happen server-side, attributed to the acting employee.
      const res = await fetch(`/api/inventory/vendors?id=${deletingId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setVendors(vendors.filter(v => v.id !== deletingId));
      // Update items list to reflect unlinked suppliers
      setItems(items.map(i => i.preferred_supplier === deletingId ? { ...i, preferred_supplier: null } : i));
      setDeletingId(null);
      toast.success("Vendor archived successfully.");
    } catch (err: any) {
      toast.error('Failed to archive vendor: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVendor)
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', payment_terms: '', lead_time: '', status: 'Approved' });
        await fetchData(0, false);
        if (inlineContext === 'stock') {
          if (json.data?.id) setNewStock(prev => ({ ...prev, vendor_id: json.data.id }));
          setModalType('stock');
          setInlineContext(null);
          toast.success("Vendor added! Continuing stock receipt...");
        } else {
          setIsModalOpen(false);
          toast.success("Vendor registered successfully.");
        }
      } else { toast.error(json.error || 'Failed.'); }
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

  // Shared caller for /api/inventory/stock/qc — QC release/reject, quarantine
  // location edits, and CoA verification all go through this one endpoint so
  // every action is permission-checked, attributed, and lands in the
  // Movement Ledger.
  const runQcAction = useCallback(async (stockId: string, action: string, extra: Record<string, any> = {}) => {
    const res = await fetch('/api/inventory/stock/qc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_id: stockId, action, ...extra })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Action failed');
    return json.data;
  }, []);

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

  const filteredStock = useMemo(() => {
    let result = filterStock(stock, stockFilter);
    if (stockSort === 'expiry') {
      result = result.sort((a, b) => new Date(a.expiry_date || '2099-12-31').getTime() - new Date(b.expiry_date || '2099-12-31').getTime());
    } else if (stockSort === 'name') {
      result = result.sort((a, b) => (a.inventory_items?.name || '').localeCompare(b.inventory_items?.name || ''));
    } else if (stockSort === 'quantity_asc') {
      result = result.sort((a, b) => Number(a.current_quantity || 0) - Number(b.current_quantity || 0));
    } else if (stockSort === 'quantity_desc') {
      result = result.sort((a, b) => Number(b.current_quantity || 0) - Number(a.current_quantity || 0));
    } else if (stockSort === 'newest') {
      result = result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }
    return result;
  }, [stock, stockFilter, stockSort]);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {activeTab === 'stock' && [
          { label: 'Total Items in Stock', count: stockStats.total, type: 'all', icon: Package, tone: 'slate' },
          { label: 'Low Stock', count: stockStats.low, type: 'low', icon: Boxes, tone: stockStats.low > 0 ? 'amber' : 'slate' },
          { label: 'Expiring (<30d)', count: stockStats.expiring, type: 'expiring', icon: Clock, tone: stockStats.expiring > 0 ? 'orange' : 'slate' },
          { label: 'Expired', count: stockStats.expired, type: 'expired', icon: Ban, tone: stockStats.expired > 0 ? 'red' : 'slate' },
        ].map(tile => {
          const Icon = tile.icon;
          const pct = stockStats.total > 0 && tile.type !== 'all' ? Math.round((tile.count / stockStats.total) * 100) : null;
          const tones: Record<string, { badge: string; ring: string; bar: string }> = {
            slate: { badge: 'bg-slate-100 text-slate-700', ring: 'ring-slate-100 border-slate-400', bar: 'bg-slate-500' },
            amber: { badge: 'bg-amber-100 text-amber-700', ring: 'ring-amber-100 border-amber-400', bar: 'bg-amber-500' },
            orange: { badge: 'bg-orange-100 text-orange-700', ring: 'ring-orange-100 border-orange-400', bar: 'bg-orange-500' },
            red: { badge: 'bg-red-100 text-red-700', ring: 'ring-red-100 border-red-400', bar: 'bg-red-500' },
          };
          const t = tones[tile.tone];
          return (
            <button
              key={tile.type}
              onClick={() => setStockFilter(tile.type as StockFilter)}
              className={`p-4 rounded-2xl border bg-white flex flex-col gap-2.5 text-left transition-all shadow-sm hover:shadow-md ${
                stockFilter === tile.type ? `ring-2 ${t.ring}` : 'border-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.badge}`}><Icon className="w-4.5 h-4.5" /></span>
                {pct !== null && tile.count > 0 && <span className="text-[11px] font-black text-slate-400">{pct}%</span>}
              </div>
              <div>
                <span className="text-2xl font-black font-mono text-slate-900 leading-none">{tile.count}</span>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">{tile.label}</p>
              </div>
            </button>
          );
        })}

        {activeTab === 'items' && [
          { label: 'Total Registered', count: itemStats.total, icon: Package, tone: 'slate' },
          { label: 'Hazardous Items', count: itemStats.hazardous, icon: Flame, tone: itemStats.hazardous > 0 ? 'amber' : 'slate' },
          { label: 'Cold Chain Required', count: itemStats.coldChain, icon: Snowflake, tone: itemStats.coldChain > 0 ? 'sky' : 'slate' },
          { label: 'CoA Required', count: itemStats.coaRequired, icon: FileCheck2, tone: 'slate' },
        ].map(tile => {
          const Icon = tile.icon;
          const badges: Record<string, string> = { slate: 'bg-slate-100 text-slate-700', amber: 'bg-amber-100 text-amber-700', sky: 'bg-sky-100 text-sky-700' };
          return (
            <div key={tile.label} className="p-4 rounded-2xl border border-slate-100 bg-white flex flex-col gap-2.5 shadow-sm">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${badges[tile.tone]}`}><Icon className="w-4.5 h-4.5" /></span>
              <div>
                <span className="text-2xl font-black font-mono text-slate-900 leading-none">{tile.count}</span>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">{tile.label}</p>
              </div>
            </div>
          );
        })}

        {activeTab === 'vendors' && [
          { label: 'Total Suppliers', count: vendorStats.total, icon: Truck, tone: 'slate' },
          { label: 'Have Email', count: vendorStats.withEmail, icon: Mail, tone: 'slate' },
          { label: 'Have Phone', count: vendorStats.withPhone, icon: Phone, tone: 'slate' },
          { label: 'Lead Time Set', count: vendorStats.withLeadTime, icon: Clock, tone: vendorStats.withLeadTime < vendorStats.total ? 'amber' : 'slate' },
        ].map(tile => {
          const Icon = tile.icon;
          const badges: Record<string, string> = { slate: 'bg-slate-100 text-slate-700', amber: 'bg-amber-100 text-amber-700' };
          return (
            <div key={tile.label} className="p-4 rounded-2xl border border-slate-100 bg-white flex flex-col gap-2.5 shadow-sm">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${badges[tile.tone]}`}><Icon className="w-4.5 h-4.5" /></span>
              <div>
                <span className="text-2xl font-black font-mono text-slate-900 leading-none">{tile.count}</span>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">{tile.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-slate-800 items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Inventory & Supply Chain</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">O2B Global Traceability System</p>
          </div>
        </div>
        <div className="flex gap-3 relative">
          {/* Context-aware Options dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowOptions(v => !v)}
              className="flex items-center px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95"
            >
              <Filter className="w-4 h-4 mr-2" /> Options
            </button>
            {showOptions && (
              <div className="absolute left-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 overflow-hidden">
                {activeTab === 'stock' && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-xs font-black text-slate-400 uppercase tracking-widest">Filter Stock</p>
                    {[['all','All Stock'],['low','Low Stock Only'],['expiring','Expiring (&lt;30d)'],['expired','Expired']].map(([val, label]) => (
                      <button key={val} onClick={() => { setStockFilter(val as StockFilter); setShowOptions(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors ${ stockFilter === val ? 'text-slate-700 bg-slate-50/60' : 'text-slate-700' }`}>
                        {label}
                      </button>
                    ))}
                  </>
                )}
                {activeTab === 'items' && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-xs font-black text-slate-400 uppercase tracking-widest">Sort Registry</p>
                    {[['name','Name (Aâ€“Z)'],['newest','Newest First'],['stock','By Min Stock Level']].map(([val, label]) => (
                      <button key={val} onClick={() => { setRegistrySort(val); setShowOptions(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 transition-colors ${ registrySort === val ? 'text-slate-700 bg-slate-50/60' : 'text-slate-700' }`}>
                        {label}
                      </button>
                    ))}
                  </>
                )}
                {activeTab === 'vendors' && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-xs font-black text-slate-400 uppercase tracking-widest">Supplier Options</p>
                    <button onClick={() => { setRegistrySearch(''); setShowOptions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Clear Search</button>
                    <button onClick={() => { setRegistrySort('name'); setShowOptions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Sort Aâ€“Z</button>
                  </>
                )}
                <div className="border-t border-slate-100 mt-1 mb-1" />
                <button onClick={() => setShowOptions(false)} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-50 transition-colors">Close</button>
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-100/70 p-1.5 rounded-2xl gap-2">
        <div className="flex gap-1 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'stock', label: 'Stock Log', icon: Boxes },
            { id: 'pr', label: 'Purchase Requests', icon: ClipboardList },
            { id: 'traceability', label: 'Traceability', icon: Workflow },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 ${isActive ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {isActive && (
                  <motion.span layoutId="inventoryTabPill" className="absolute inset-0 bg-white rounded-xl shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
                )}
                <Icon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="relative group w-full sm:w-auto">
          <button className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-between sm:justify-start gap-2 transition-all ${['items', 'vendors'].includes(activeTab) ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <div className="flex items-center gap-2"><Database className="w-4 h-4" /> Master Data</div>
            <ChevronDown className="w-3.5 h-3.5 opacity-50 group-hover:rotate-180 transition-transform" />
          </button>
          <div className="absolute right-0 top-full mt-1 w-full sm:w-48 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
            <button onClick={() => setActiveTab('items')} className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 rounded-t-xl hover:bg-slate-50 transition-colors ${activeTab === 'items' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-700'}`}><Package className="w-4 h-4"/> Item Registry</button>
            <div className="h-px bg-slate-50 mx-2" />
            <button onClick={() => setActiveTab('vendors')} className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 rounded-b-xl hover:bg-slate-50 transition-colors ${activeTab === 'vendors' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-700'}`}><Truck className="w-4 h-4"/> Suppliers (AVL)</button>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search by item name or lot number..."
            className="block w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm focus:ring-4 focus:ring-slate-50 focus:border-slate-500 font-bold transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <select
            value={stockSort}
            onChange={(e) => setStockSort(e.target.value)}
            className="px-4 py-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold focus:ring-4 focus:ring-slate-50 focus:border-slate-500 shadow-sm"
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
            className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shrink-0"
          >
            <QrCode className="w-5 h-5" /> Scan
          </button>
        </div>
      </div>

      {activeTab === 'stock' && (
        <div className="grid grid-cols-1 gap-4">

          {filteredStock.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                <Package className="w-8 h-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-500 uppercase tracking-widest">{getStockFilterLabel(stockFilter)}</p>
                <p className="text-xs font-bold text-slate-400 mt-1">
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
            <>
              {/* PREMIUM DATA TABLE VIEW */}
              {viewMode === 'table' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-slate-50/80 backdrop-blur-md border-b border-slate-100/80 sticky top-0 z-10">
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-1/4">Item Details</th>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-1/6">Lot & Expiry</th>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 text-right w-1/6">Balance</th>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-1/6">Supplier & Loc</th>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 w-1/6">Last Updated (ALCOA)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredStock.map(s => {
                          const risk = getStockRisk(s);
                          const lastUpdatedDate = s.updated_at ? new Date(s.updated_at) : new Date(s.created_at);
                          return (
                            <tr key={s.id} onClick={() => setSelectedStock(s)} className={`group transition-all duration-300 cursor-pointer ${risk.isExpired ? 'bg-red-50/20 hover:bg-red-50/50' : 'hover:bg-slate-50/80'}`}>
                              <td className="px-5 py-4">
                                <div className="text-sm font-black text-slate-800 flex items-center gap-2 group-hover:text-indigo-700 transition-colors">
                                  {s.inventory_items?.name}
                                  {(risk.isExpired || risk.isExpiring || risk.isLow) && (
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${risk.isExpired || risk.isOut ? 'bg-red-100 text-red-700 ring-1 ring-red-200' : risk.isLow ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-orange-100 text-orange-700 ring-1 ring-orange-200'}`}>
                                      <AlertTriangle className="w-2.5 h-2.5" /> {risk.isOut ? 'Out' : risk.isExpired ? 'Expired' : risk.isLow ? 'Low' : 'Near Exp'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{s.inventory_items?.category || 'Uncategorized'}</div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="text-[13px] font-mono font-bold text-slate-700">{s.supplier_batch_number || 'No Lot #'}</div>
                                <div className={`text-[11px] font-bold uppercase tracking-wider mt-1 ${risk.isExpired ? 'text-red-600' : 'text-slate-500'}`}>
                                  Exp: {s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'N/A'}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span className={`text-base font-black font-mono ${risk.isOut ? 'text-slate-300' : risk.isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                                  {s.current_quantity}
                                </span>
                                <span className="text-[11px] font-bold text-slate-400 ml-1.5">{s.inventory_items?.unit}</span>
                              </td>
                              <td className="px-5 py-4">
                                <div className="text-[13px] font-semibold text-slate-700 truncate">{s.vendors?.name || 'Local / Direct'}</div>
                                <div className="mt-1">
                                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 ring-1 ring-slate-200/50">
                                    {s.location || 'Central Store'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="text-[11px] font-black text-slate-700 flex flex-col gap-0.5">
                                  <span>{lastUpdatedDate.toLocaleDateString()} at {lastUpdatedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                                    By {s.updated_by ? 'Updater' : (s.creator?.initials || s.creator?.full_name || 'System')}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
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
                className="px-8 py-3 bg-white border border-slate-100 text-slate-800 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all flex items-center gap-2"
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
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, code, or category..."
                value={registrySearch}
                onChange={(e) => setRegistrySearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-600 text-sm font-bold"
              />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-xs font-black uppercase text-slate-400 whitespace-nowrap">Sort By</span>
              <select
                value={registrySort}
                onChange={(e) => setRegistrySort(e.target.value)}
                className="px-4 py-2.5 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 text-xs font-bold focus:ring-2 focus:ring-slate-600"
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
                      className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSelectMode(true)}
                    className="px-4 py-2.5 bg-slate-50 text-slate-500 rounded-2xl text-xs font-black uppercase tracking-widest ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 transition-all"
                  >
                    Select
                  </button>
                )
              )}
            </div>
          </div>

          {Object.keys(filteredRegistry).length === 0 ? (
            <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                <Package className="w-8 h-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-500 uppercase tracking-widest">No matching items found</p>
                <p className="text-xs font-bold text-slate-400 mt-1">Adjust your search or register new items</p>
              </div>
            </div>
          ) : (
            Object.entries(filteredRegistry).sort(([a],[b]) => a.localeCompare(b)).map(([category, catItems]) => {
              const meta = getCategoryMeta(category);
              const CatIcon = meta.icon;
              return (
              <div key={category} className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="h-px flex-1 bg-slate-100"></div>
                  <h2 className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${meta.chip}`}>
                    <CatIcon className="w-3.5 h-3.5" /> {category} ({catItems.length})
                  </h2>
                  <div className="h-px flex-1 bg-slate-100"></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      onClick={isSelectMode ? () => toggleItemSelect(item.id) : undefined}
                      className={`bg-white rounded-2xl border px-3 py-2.5 relative group overflow-hidden transition-all hover:shadow-md ${
                        isSelectMode ? 'cursor-pointer' : ''
                      } ${selectedItemIds.has(item.id) ? 'border-red-400 ring-2 ring-red-200 bg-red-50/30' : 'border-slate-100 shadow-sm'}`}
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full ${meta.bar}`}></div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="px-2 py-0.5 rounded text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-500">{item.sub_category || 'General'}</span>
                        {isSelectMode ? (
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedItemIds.has(item.id) ? 'bg-red-600 border-red-600' : 'border-slate-300 bg-white'}`}>
                            {selectedItemIds.has(item.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {(item as any).creator && (
                              <CreatorBadge initials={(item as any).creator.initials} fullName={(item as any).creator.full_name} size="sm" />
                            )}
                            {canEditItems ? (
                              <>
                                <button
                                  onClick={() => { setNewItem({...item}); setModalType('edit_item'); setIsModalOpen(true); }}
                                  className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all border border-slate-200 shadow-sm">
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => { setDeleteType('item'); setDeletingId(item.id); }}
                                    className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200 shadow-sm">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
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
                            ) : null}
                          </div>
                        )}
                      </div>
                      
                      <h3 className="text-[13px] sm:text-sm font-black text-indigo-700 leading-tight group-hover:text-indigo-800 transition-colors">{item.name}</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        {item.unit}{(item as any).hazardous && <span className="ml-1 text-orange-500">⚠</span>}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between gap-1">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Stock</p>
                          <p className="text-xs font-black text-slate-800">{item.min_stock_level || '0'} {item.unit}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Code</p>
                          <p className="text-xs font-mono font-bold text-slate-500 truncate max-w-[72px]">{item.item_code || '---'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );})
          )}
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-50 backdrop-blur-sm">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2.5rem] p-6 md:p-5 md:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Archive {selectedItemIds.size} Items?</h2>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              This will archive {selectedItemIds.size} item(s), removing them from the active registry. Records are retained for audit and can be restored — this does not delete their stock/lot history.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteItems}
                disabled={isBulkDeleting}
                className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-red-700 shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isBulkDeleting ? 'Archiving...' : `Archive ${selectedItemIds.size} Items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-50 backdrop-blur-sm">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2.5rem] p-6 md:p-5 md:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Archive Record?</h2>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              {deleteType === 'item'
                ? "This will archive the item, removing it from the active registry. It's retained for audit and can be restored — its stock/lot history is not affected."
                : "This will archive the supplier, removing it from your Approved Vendor List (AVL). It's retained for audit and can be restored."}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteType === 'item' ? handleDeleteItem() : handleDeleteVendor()}
                disabled={isDeleting}
                className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-red-700 shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                <Truck className="w-8 h-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-500 uppercase tracking-widest">No suppliers added</p>
                <p className="text-xs font-bold text-slate-400 mt-1">Tap &apos;Add Supplier&apos; to expand your AVL</p>
              </div>
              {canDo('inventory', 'edit') && (
                <button onClick={() => { setModalType('vendors'); setIsModalOpen(true); }} className="mt-2 flex items-center px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-900 transition-all">
                  Add Supplier
                </button>
              )}
            </div>
          ) : vendors.map(vendor => (
            <div key={vendor.id} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-all flex gap-2">
                 {canEditItems && (
                    <button
                      onClick={() => { setNewVendor({...vendor}); setModalType('edit_vendor'); setIsModalOpen(true); }}
                      className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all border border-slate-200 shadow-sm">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                 )}
                 {isAdmin && (
                    <button
                      onClick={() => { setDeleteType('vendor'); setDeletingId(vendor.id); }}
                      className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200 shadow-sm">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                 )}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-sm shrink-0">
                  {(vendor.name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-slate-950 truncate">{vendor.name}</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{vendor.contact_person || 'No Contact'}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-50 space-y-2">
                <p className="text-xs font-bold text-slate-600 flex items-center gap-2"><Mail className="w-3 h-3"/> {vendor.email || 'No email'}</p>
                <div className={`px-2 py-1 text-xs font-black uppercase tracking-widest rounded inline-block ${
                  vendor.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                  vendor.status === 'Conditional' ? 'bg-amber-50 text-amber-700' :
                  vendor.status === 'Blacklisted' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'
                }`}>
                  {vendor.status || 'Approved'} Supplier
                </div>
                {/* A-09: Vendor qualification badge */}
                <div className={`ml-1 px-2 py-1 text-xs font-black uppercase tracking-widest rounded inline-block ${
                  vendor.qualification_status === 'Approved' ? 'bg-slate-100 text-slate-900' :
                  vendor.qualification_status === 'Under Review' ? 'bg-amber-50 text-amber-700' :
                  vendor.qualification_status === 'Suspended' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {vendor.qualification_status || 'Unqualified'} (AVL)
                </div>
                {vendor.audit_due_date && new Date(vendor.audit_due_date) < new Date() && (
                  <p className="text-xs text-red-600 font-bold mt-1">⚠ Vendor audit overdue since {new Date(vendor.audit_due_date).toLocaleDateString('en-IN')}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-50 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] md:animate-in fade-in zoom-in duration-200">
            <div className="px-5 py-4 sm:px-6 sm:py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-800">
                  {modalType === 'stock' ? 'Receive Warehouse Shipment' : modalType === 'edit_stock' ? 'Edit Stock Log' : modalType === 'items' ? 'Register Raw Material' : modalType === 'edit_item' ? 'Edit Raw Material' : modalType === 'edit_vendor' ? 'Edit Supplier' : 'Register Approved Supplier'}
                </h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
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
                modalType={modalType} vendors={vendors} inlineContext={inlineContext}
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
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[1100] flex items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl rounded-none sm:rounded-2xl bg-white h-[100dvh] sm:h-auto sm:max-h-[90vh] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 bg-slate-50 border-b border-slate-100 relative shrink-0">
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
                  }} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                    <Edit3 className="w-4 h-4"/> Edit
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedStock(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200 rounded-lg transition-all"><X className="w-5 h-5"/></button>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600">{selectedStock.inventory_items?.category}</span>
              <h2 className="text-xl font-black font-mono tracking-tighter mt-1 text-slate-800">{selectedStock.inventory_items?.name}</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Lot: {selectedStock.supplier_batch_number || 'N/A'}</p>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Available Balance</p>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">{selectedStock.current_quantity} <span className="text-xs">{selectedStock.inventory_items?.unit}</span></p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Expiry Date</p>
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
                    {movements.map(m => {
                      const label = m.type === 'Receive' ? 'Stock Input' : m.type === 'Issue' ? 'Stock Issue' : m.type;
                      const isQuantityMovement = m.type === 'Receive' || m.type === 'Issue';
                      return (
                        <div key={m.id} className="p-4 flex items-center justify-between text-xs group hover:bg-slate-50 transition-colors">
                          <div className="flex-1">
                            <p className="font-black text-slate-800 text-sm flex items-center gap-2">
                              {label}
                              {isQuantityMovement && (
                                <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md border ${m.type === 'Receive' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                                  {m.type === 'Receive' ? '+' : '-'}{m.quantity} {selectedStock.inventory_items?.unit}
                                </span>
                              )}
                            </p>
                            <p className="text-slate-500 font-bold mt-1 uppercase tracking-wider text-[10px]">{new Date(m.created_at).toLocaleString()}</p>
                            {m.notes && (
                              <p className="text-slate-600 font-semibold mt-1.5 max-w-[280px] bg-white border border-slate-100 shadow-sm p-1.5 rounded-lg text-[11px]">
                                {m.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Action By</span>
                              <span className="font-black text-indigo-700 mt-0.5">{m.issued_by?.email || 'System'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Batch Usage (ALCOA++) */}
              {batchUsageMap[selectedStock.id]?.length > 0 && (
                <div className="px-6 pb-6">
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Batches Using this Stock</h4>
                    <div className="flex flex-wrap gap-2">
                      {batchUsageMap[selectedStock.id].map(b => (
                        <Link
                          key={b.id}
                          href={`/batches/${b.id}`}
                          className="px-2.5 py-1.5 bg-white text-indigo-700 text-xs font-black rounded-lg border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all flex items-center gap-1.5"
                        >
                          <Beaker className="w-3.5 h-3.5 text-indigo-400" />
                          {b.batch_id}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
                  className="flex-1 py-4 bg-slate-100 text-slate-700 font-black rounded-2xl text-xs uppercase tracking-widest shadow-sm hover:bg-slate-200 transition-all text-center flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4" /> View QR
                </button>
                {(selectedStock.status === 'Quarantined' || selectedStock.qc_status === 'Quarantine') && !canDo('inventory', 'qc_release') ? (
                  <div className="flex-[2] py-3 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs font-black text-slate-500">
                    Awaiting QC disposition by an authorised Scientist+
                  </div>
                ) : selectedStock.status === 'Quarantined' || selectedStock.qc_status === 'Quarantine' ? (
                  <button
                    onClick={async () => {
                       const qcNotes = window.prompt('QC Release Notes (identity test result, sampling method, observations):');
                       if (qcNotes === null || !qcNotes.trim()) return; // user cancelled or left it blank
                       const auditResult = await requestReason().catch(() => null);
                       if (!auditResult) return;
                       try {
                         await runQcAction(selectedStock.id, 'release', { notes: qcNotes.trim(), reason: auditResult.reason, pin: auditResult.pin });
                         toast.success('Stock QC Released — status updated to Available');
                         setSelectedStock({...selectedStock, status: 'Available', qc_status: 'Released'});
                         fetchData(0, false);
                       } catch (err: any) {
                         toast.error(err.message);
                       }
                    }}
                    className="flex-[2] py-4 bg-amber-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-lg hover:bg-amber-600 transition-all text-center"
                  >
                    ✓ QC Release (Quarantine → Available)
                  </button>
                ) : selectedStock.qc_status === 'Rejected' ? (
                  <div className="flex-[2] py-3 bg-red-50 border border-red-200 rounded-2xl text-center text-xs font-black text-red-700">
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
                    className="flex-[2] py-4 bg-slate-800 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-lg hover:bg-slate-900 transition-all text-center"
                  >
                    Issue Stock Out
                  </button>
                )}
              </div>

              {/* A-08: AQL Sampling Plan */}
              {selectedStock.received_quantity && (
                <div className="mt-2 p-2 bg-slate-100 border border-slate-300 rounded-xl text-xs">
                  <p className="font-black text-slate-900 uppercase mb-0.5">A-08 AQL Level II Incoming Sample Guide</p>
                  <p className="text-slate-900 font-semibold">
                    Lot qty: {selectedStock.received_quantity} → Sample: {Math.max(1, Math.round(parseFloat(String(selectedStock.received_quantity)) * 0.1))} units · Accept ≤0 defects · Reject ≥1
                  </p>
                </div>
              )}

              {/* A-46: Quarantine location + A-47: Rejection + A-45: CoA verification */}
              {(selectedStock.status === 'Quarantined' || selectedStock.qc_status === 'Quarantine') && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-black text-slate-500 uppercase">A-46 Quarantine Location</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      defaultValue={selectedStock.quarantine_location || ''}
                      placeholder="Storage location (e.g. QC Cage 1)"
                      className="px-2 py-1.5 border border-amber-200 rounded-lg text-xs font-semibold outline-none bg-amber-50"
                      onBlur={async (e) => {
                        if (e.target.value === (selectedStock.quarantine_location || '')) return;
                        const auditResult = await requestReason().catch(() => null);
                        if (!auditResult) { e.target.value = selectedStock.quarantine_location || ''; return; }
                        try {
                          await runQcAction(selectedStock.id, 'quarantine_location', { location: e.target.value || null, reason: auditResult.reason, pin: auditResult.pin });
                        } catch (err: any) {
                          e.target.value = selectedStock.quarantine_location || '';
                          toast.error(err.message);
                        }
                      }}
                    />
                    <input
                      defaultValue={selectedStock.quarantine_rack || ''}
                      placeholder="Rack / shelf"
                      className="px-2 py-1.5 border border-amber-200 rounded-lg text-xs font-semibold outline-none bg-amber-50"
                      onBlur={async (e) => {
                        if (e.target.value === (selectedStock.quarantine_rack || '')) return;
                        const auditResult = await requestReason().catch(() => null);
                        if (!auditResult) { e.target.value = selectedStock.quarantine_rack || ''; return; }
                        try {
                          await runQcAction(selectedStock.id, 'quarantine_location', { rack: e.target.value || null, reason: auditResult.reason, pin: auditResult.pin });
                        } catch (err: any) {
                          e.target.value = selectedStock.quarantine_rack || '';
                          toast.error(err.message);
                        }
                      }}
                    />
                  </div>
                  {/* A-45: CoA verification */}
                  <div className="flex items-center justify-between p-2 bg-slate-100 border border-slate-300 rounded-lg">
                    <span className="text-xs font-black text-slate-900">A-45 CoA Verified</span>
                    <input type="checkbox"
                      defaultChecked={!!selectedStock.coa_url}
                      onChange={async (e) => {
                        if (!e.target.checked) return;
                        const url = window.prompt('Enter CoA document URL (from supplier):');
                        if (!url) { e.target.checked = false; return; }
                        const auditResult = await requestReason().catch(() => null);
                        if (!auditResult) { e.target.checked = false; return; }
                        try {
                          await runQcAction(selectedStock.id, 'coa_verify', { coa_url: url, reason: auditResult.reason, pin: auditResult.pin });
                          setSelectedStock({ ...selectedStock, coa_url: url });
                          toast.success('CoA URL saved.');
                        } catch (err: any) {
                          e.target.checked = false;
                          toast.error(err.message);
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-400"
                    />
                  </div>
                  {/* A-47: Rejection workflow */}
                  {canDo('inventory', 'qc_release') && (
                    <button
                      className="w-full py-2 bg-red-50 border border-red-200 text-red-700 font-black rounded-xl text-xs uppercase tracking-wider hover:bg-red-100"
                      onClick={async () => {
                        const reason = window.prompt('Rejection reason (failed identity test, contamination, CoA mismatch, etc.):');
                        if (!reason || !reason.trim()) return;
                        const auditResult = await requestReason().catch(() => null);
                        if (!auditResult) return;
                        try {
                          await runQcAction(selectedStock.id, 'reject', { notes: reason.trim(), reason: auditResult.reason, pin: auditResult.pin });
                          toast.success('Lot rejected and marked as Discarded.');
                          setSelectedStock(null);
                          fetchData(0, false);
                        } catch (err: any) {
                          toast.error(err.message);
                        }
                      }}
                    >
                      ✗ Reject Lot (A-47)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && selectedStock && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[1200] flex items-center justify-center p-4" onClick={() => setShowQR(false)}>
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
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Auto-Load Inventory Catalog</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">
              This will automatically load 115 standard inventory items and common lab equipment into the system. Perfect for initial setup. Proceed?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingSeed(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
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
      {auditModal}
    </div>
  );
}
