'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { FlaskConical, Save, Plus, X } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import { useForm, useFieldArray } from 'react-hook-form';

export default function NewRndExperimentPage() {
  const router = useRouter();
  const { canDo } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inventoryStock, setInventoryStock] = useState([]);

  const canCreate = canDo('rnd_experiments', 'create');

  const { register, handleSubmit, control, watch } = useForm({
    defaultValues: {
      title: '',
      target_volume: '',
      target_ph: '',
      target_brix: '',
      notes: '',
      ingredients: [],
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'ingredients' });

  useEffect(() => {
    (async () => {
      const { data } = await withTimeout(
        supabase.from('inventory_stock').select('id, current_quantity, supplier_batch_number, inventory_items(name, unit, category)').gt('current_quantity', 0)
      );
      setInventoryStock(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  const onSave = async (formData) => {
    if (!formData.title?.trim()) {
      toast.warn('Give the experiment a title.');
      return;
    }
    const validIngredients = (formData.ingredients || []).filter((ing) => ing.stock_id && ing.amount);
    if (validIngredients.length === 0) {
      toast.warn('Add at least one ingredient — this logs real inventory consumption.');
      return;
    }
    setSaving(true);
    try {
      const res = await withTimeout(fetch('/api/rnd-experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }));
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save experiment');
      toast.success(`Experiment ${data.experiment_id} logged and inventory deducted.`);
      router.push(`/product-development/experiments/${data.id}`);
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  if (!canCreate) {
    return <div className="p-12 text-center text-red-500 font-bold">You don&apos;t have permission to log an experiment.</div>;
  }
  if (loading) return <div className="p-12 text-center text-slate-500 font-bold">Loading...</div>;

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <MobilePageHeader title="New R&D Experiment" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <FlaskConical className="w-8 h-8 text-navy" />
            <div>
              <h1 className="text-xl font-black text-navy">New Standalone Experiment</h1>
              <p className="text-sm font-bold text-slate-400">Not tied to a production batch — an ID is assigned on save.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Title</label>
              <input {...register('title')} placeholder="e.g. Low-sugar sweetener ratio trial" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target Volume (ml)</label>
                <input type="number" {...register('target_volume')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target pH</label>
                <input type="number" step="0.1" {...register('target_ph')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Target Brix</label>
                <input type="number" step="0.1" {...register('target_brix')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Ingredients Used</h3>
                <button type="button" onClick={() => append({ stock_id: '', amount: '', unit: 'g' })} className="text-xs font-bold text-navy bg-navy/5 hover:bg-navy/10 px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Ingredient
                </button>
              </div>

              <div className="space-y-3">
                {fields.length === 0 && <p className="text-sm text-slate-400 italic">No ingredients added yet. This will deduct real inventory on save.</p>}
                {fields.map((field, idx) => {
                  const selectedStockId = watch(`ingredients.${idx}.stock_id`);
                  const selectedStock = inventoryStock.find(s => s.id === selectedStockId);
                  return (
                  <div key={field.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <select {...register(`ingredients.${idx}.stock_id`)} className="flex-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white">
                      <option value="">Select ingredient from inventory...</option>
                      {inventoryStock.map(stock => (
                        <option key={stock.id} value={stock.id}>
                          {stock.inventory_items?.name} (Lot: {stock.supplier_batch_number || stock.id.split('-')[0]}) - {stock.current_quantity} {stock.inventory_items?.unit} available
                        </option>
                      ))}
                    </select>
                    <input type="number" step="0.1" {...register(`ingredients.${idx}.amount`)} placeholder="Amt" className="w-24 px-3 py-1.5 text-sm rounded-md border border-slate-200" />
                    <div className="w-12 text-xs font-bold text-slate-500 px-1 py-1.5">{selectedStock?.inventory_items?.unit || 'unit'}</div>
                    <button type="button" onClick={() => remove(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )})}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Process Notes</label>
              <textarea {...register('notes')} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-navy/30 outline-none" placeholder="Method, observations, rationale..." />
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={handleSubmit(onSave)}
                disabled={saving}
                className="flex items-center gap-2 bg-navy text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-navy/10 hover:bg-navy-hover disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Log Experiment &amp; Deduct Inventory
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
