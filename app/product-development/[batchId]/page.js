'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { Beaker, Save, Package, X, Plus, Clock } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import { format } from 'date-fns';
import { useForm, useFieldArray } from 'react-hook-form';

export default function ProductDevelopmentDetail() {
  const { batchId } = useParams();
  const { canDo } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inventoryStock, setInventoryStock] = useState([]);
  const [history, setHistory] = useState([]);

  const { register, handleSubmit, control, reset, watch } = useForm({
    defaultValues: {
      ingredients: [],
      notes: '',
      target_volume: '',
      target_ph: '',
      target_brix: ''
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'ingredients'
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: bData, error } = await withTimeout(
        supabase.from('batches').select('*').eq('id', batchId).maybeSingle()
      );

      if (error || !bData) {
        toast.error('Failed to load batch');
        setLoading(false);
        return;
      }

      const { data: stockData } = await withTimeout(
        supabase.from('inventory_stock').select('id, current_quantity, supplier_batch_number, inventory_items(name, unit, category)').gt('current_quantity', 0)
      );

      const { data: historyData } = await withTimeout(
        supabase
          .from('product_development_formulations')
          .select('id, target_volume_ml, target_ph, target_brix, notes, created_at, employees(full_name), product_development_ingredients(id, item_name, amount, unit)')
          .eq('batch_id', batchId)
          .order('created_at', { ascending: false })
      );

      setInventoryStock(stockData || []);
      setHistory(historyData || []);
      setBatch(bData);

      reset({
        notes: '',
        target_volume: bData.planned_volume_ml || '',
        target_ph: '',
        target_brix: '',
        ingredients: []
      });
    } catch (err) {
      toast.error(err.message || 'Request timed out');
    }
    setLoading(false);
  }, [batchId, supabase, reset, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onSave = async (formData) => {
    const validIngredients = (formData.ingredients || []).filter((ing) => ing.stock_id && ing.amount);
    if (validIngredients.length === 0 && !formData.notes?.trim()) {
      toast.warn('Add at least one ingredient or a process note before saving.');
      return;
    }
    setSaving(true);
    try {
      const res = await withTimeout(fetch(`/api/product-development/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, formData })
      }));
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save formulation');
      toast.success('RTD formulation saved and inventory deducted');
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-12 text-center text-slate-500 font-bold">Loading RTD Data...</div>;
  if (!batch) return <div className="p-12 text-center text-red-500 font-bold">Batch not found</div>;

  const canEdit = canDo('batches', 'create');

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <MobilePageHeader title={`RTD: ${batch.batch_id}`} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Beaker className="w-8 h-8 text-navy" />
            <div>
              <h1 className="text-xl font-black text-navy">{batch.batch_id}</h1>
              <p className="text-sm font-bold text-slate-400">Product Development Workflow</p>
            </div>
          </div>

          {!canEdit && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-800">
              You have view-only access to this batch&apos;s formulation log.
            </div>
          )}

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target Volume (ml)</label>
                <input type="number" disabled={!canEdit} {...register('target_volume')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none disabled:bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target pH</label>
                <input type="number" step="0.1" disabled={!canEdit} {...register('target_ph')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none disabled:bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target Brix</label>
                <input type="number" step="0.1" disabled={!canEdit} {...register('target_brix')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none disabled:bg-slate-50" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Formulation Ingredients</h3>
                {canEdit && (
                  <button type="button" onClick={() => append({ stock_id: '', amount: '', unit: 'g' })} className="text-xs font-bold text-navy bg-navy/5 hover:bg-navy/10 px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Ingredient
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {fields.length === 0 && <p className="text-sm text-slate-400 italic">No ingredients added yet. Pull pellets or extracts from inventory.</p>}
                {fields.map((field, idx) => {
                  const selectedStockId = watch(`ingredients.${idx}.stock_id`);
                  const selectedStock = inventoryStock.find(s => s.id === selectedStockId);
                  return (
                  <div key={field.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <select disabled={!canEdit} {...register(`ingredients.${idx}.stock_id`)} className="flex-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white">
                      <option value="">Select ingredient from inventory...</option>
                      {inventoryStock.map(stock => (
                        <option key={stock.id} value={stock.id}>
                          {stock.inventory_items?.name} (Lot: {stock.supplier_batch_number || stock.id.split('-')[0]}) - {stock.current_quantity} {stock.inventory_items?.unit} available
                        </option>
                      ))}
                    </select>
                    <input type="number" step="0.1" disabled={!canEdit} {...register(`ingredients.${idx}.amount`)} placeholder="Amt" className="w-24 px-3 py-1.5 text-sm rounded-md border border-slate-200" />
                    <div className="w-12 text-xs font-bold text-slate-500 px-1 py-1.5">{selectedStock?.inventory_items?.unit || 'unit'}</div>
                    {canEdit && (
                      <button type="button" onClick={() => remove(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )})}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Process Notes</label>
              <textarea disabled={!canEdit} {...register('notes')} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none disabled:bg-slate-50" placeholder="Mixing instructions, observations..." />
            </div>

            {canEdit && (
              <div className="flex justify-end gap-3 pt-6">
                <button
                  type="button"
                  onClick={handleSubmit(onSave)}
                  disabled={saving}
                  className="flex items-center gap-2 bg-navy text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-navy/10 hover:bg-navy-hover disabled:opacity-50"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Product Formulation
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" /> Formulation History
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No formulations recorded yet for this batch.</p>
          ) : (
            <div className="space-y-4">
              {history.map((h) => (
                <div key={h.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-3 text-xs font-bold text-slate-600">
                      {h.target_volume_ml && <span>{h.target_volume_ml} ml</span>}
                      {h.target_ph && <span>pH {h.target_ph}</span>}
                      {h.target_brix && <span>Brix {h.target_brix}</span>}
                    </div>
                    <span className="text-xs text-slate-400 font-semibold">
                      {format(new Date(h.created_at), 'MMM d, yyyy HH:mm')}{h.employees?.full_name ? ` · ${h.employees.full_name}` : ''}
                    </span>
                  </div>
                  {h.product_development_ingredients?.length > 0 && (
                    <ul className="text-xs text-slate-600 space-y-0.5 mb-2">
                      {h.product_development_ingredients.map((ing) => (
                        <li key={ing.id} className="flex items-center gap-1.5">
                          <Package className="w-3 h-3 text-slate-400" />
                          {ing.item_name || 'Unknown item'}: {ing.amount} {ing.unit || ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {h.notes && <p className="text-xs text-slate-500 italic">{h.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
