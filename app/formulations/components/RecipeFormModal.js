'use client';
import { Save, Loader2, Plus, X, Clock } from 'lucide-react';

const CATEGORIES = ['Fermentation', 'Lab Media'];

/**
 * RecipeFormModal — slide-in modal for creating or editing a formulation.
 * All state (newForm, items, etc.) is owned by the parent page.
 */
export default function RecipeFormModal({
  showNew,
  newForm,
  setNewForm,
  items,
  fetchError,
  submitting,
  selectedItem,
  setSelectedItem,
  selectedQty,
  setSelectedQty,
  onAddIngredient,
  onSubmit,
  onClose,
}) {
  if (!showNew) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all">
          <X className="w-5 h-5 text-gray-400"/>
        </button>

        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            {newForm.id ? 'Edit Formulation Details' : 'New Formulation Version'}
          </h2>
          <p className="text-xs font-medium text-gray-500 mt-1">
            {newForm.base_version_id ? (
              <span className="text-emerald-600 font-bold">Iterating from base version — changes saved as new Draft</span>
            ) : 'New recipe will be saved as Draft for review'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="p-6 pt-0 space-y-4">
          {/* Code / Name / Base Volume */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Recipe Code</label>
              <input
                required type="text" placeholder="e.g. R04 / RKU / RKU01"
                value={newForm.code}
                onChange={e => setNewForm({...newForm, code: e.target.value.toUpperCase().slice(0,8)})}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm font-mono outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">1–5 uppercase letters + up to 3 digits</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Common Name</label>
              <input
                required type="text" placeholder="e.g. Agri-Boost"
                value={newForm.name}
                onChange={e => setNewForm({...newForm, name: e.target.value})}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Base Volume (mL)</label>
              <input
                required type="number" min="1" placeholder="e.g. 1000"
                value={newForm.base_volume_ml}
                onChange={e => setNewForm({...newForm, base_volume_ml: parseInt(e.target.value) || ''})}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">Scaling baseline.</p>
            </div>
          </div>

          {fetchError && <div className="p-2 bg-red-50 text-red-600 font-bold text-[10px] rounded-lg border border-red-100">{fetchError}</div>}

          {/* BOM */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Bill of Materials (BOM)</label>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <select className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold" value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
                <option value="">Select Ingredient...</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <div className="flex gap-2">
                <input type="number" placeholder="Qty" className="flex-1 sm:w-20 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold" value={selectedQty} onChange={e => setSelectedQty(e.target.value)}/>
                <button type="button" onClick={onAddIngredient} className="shrink-0 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-hover transition-all flex items-center gap-1 text-xs font-bold"><Plus className="w-4 h-4"/>Add</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {newForm.ingredients.map((ing, idx) => (
                <span key={idx} className="flex items-center gap-1.5 bg-white px-2 py-1 border border-gray-200 rounded-md text-[10px] font-black text-slate-700 shadow-sm">
                  {ing.name}: {ing.quantity}{ing.unit}
                  <button type="button" onClick={() => setNewForm(p => ({...p, ingredients: p.ingredients.filter((_, i) => i !== idx)}))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                </span>
              ))}
              {newForm.ingredients.length === 0 && <p className="text-[10px] text-gray-400 italic">No ingredients added yet.</p>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Scientific Notes / Rationale</label>
            <textarea rows="2" placeholder="Reason for this version or iteration..." value={newForm.notes} onChange={e => setNewForm({...newForm, notes: e.target.value})} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all resize-none"/>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Recipe Category</label>
            <div className="flex gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => setNewForm({...newForm, category: cat})}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${newForm.category === cat ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {newForm.category === 'Fermentation' ? 'Product recipe — used to create fermentation batches.' : 'Lab media recipe (MRS broth, LB agar, etc.) — available in Cell Bank module.'}
            </p>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2">
            <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
            <p className="text-[10px] font-bold text-blue-700">Recipe will be saved as <strong>Draft</strong>. Submit for Review → get it Approved → then launch batches.</p>
          </div>

          <button disabled={submitting} type="submit" className="w-full py-2.5 bg-navy text-white font-bold rounded-lg shadow-sm hover:bg-navy-hover transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-4 h-4"/>Save as Draft</>}
          </button>
        </form>
      </div>
    </div>
  );
}
