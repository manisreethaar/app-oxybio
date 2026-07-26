'use client';
import { Loader2 } from 'lucide-react';

const SUB_CATS: Record<string, string[]> = {
  'Raw Material': ['Active Ingredients', 'Excipients & Carriers', 'Packaging Materials'],
  'Lab Consumables': ['Reagents', 'Chemicals', 'Culture Media & Buffers', 'Indicators & Stains', 'Lab Disposables'],
  'Equipment & Maintenance': ['Spare Parts', 'Maintenance Supplies'],
  'Reference Standard': ['Certified Reference Materials', 'Calibration Standards'],
  'RAW MATERIALS LIST': ['Bulk Chemicals', 'Compounds'],
  'GLASSWARES': ['Bottles', 'Flasks', 'Measuring', 'Miscellaneous'],
  'PLASTICS AND CONSUMMABLES': ['Disposables', 'Safety Gear', 'Storage'],
  'PHOTOGRAPHY / DIAGNOSTIC MEDIA': ['Agars', 'Broths'],
  'MICROBIOLOGY CHEMICALS': ['Stains', 'Reagents', 'Solutions'],
};

interface ItemModalProps {
  modalType: string;
  vendors: any[];
  newItem: any;
  setNewItem: (v: any) => void;
  newVendor: any;
  setNewVendor: (v: any) => void;
  isSubmitting: boolean;
  handleAddItem: (e: any) => void;
  handleUpdateItem: (e: any) => void;
  handleAddVendor: (e: any) => void;
  handleUpdateVendor: (e: any) => void;
  onClose: () => void;
}

export default function ItemVendorModal({
  modalType, vendors, newItem, setNewItem, newVendor, setNewVendor,
  isSubmitting, handleAddItem, handleUpdateItem, handleAddVendor, handleUpdateVendor, onClose,
}: ItemModalProps) {

  // Item Add / Edit
  if (modalType === 'items' || modalType === 'edit_item') {
    return (
      <form onSubmit={modalType === 'items' ? handleAddItem : handleUpdateItem} className="p-5 sm:p-6 pb-24 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Item Code / SKU</label>
            <input type="text" placeholder="AUTO-GEN" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold font-mono" value={newItem.item_code} onChange={e => setNewItem({...newItem, item_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Item Name</label>
            <input type="text" required placeholder="e.g. Citric Acid" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Category</label>
            <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value, sub_category: ''})}>
              {Object.keys(SUB_CATS).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Sub-Category</label>
            <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.sub_category} onChange={e => setNewItem({...newItem, sub_category: e.target.value})}>
              <option value="">Select sub-cat...</option>
              {(SUB_CATS[newItem.category] || []).map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Unit of Measure</label>
            <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
              <option value="kg">kg</option><option value="g">g</option><option value="mg">mg</option>
              <option value="L">L</option><option value="ml">ml</option><option value="units">units</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Storage Condition</label>
            <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.storage_condition} onChange={e => setNewItem({...newItem, storage_condition: e.target.value})}>
              <option value="Room Temperature">Room Temperature</option>
              <option value="Refrigerated 2-8°C">Refrigerated</option>
              <option value="Frozen -20°C">Frozen -20°C</option>
              <option value="Chemical Cabinet">Chemical Cabinet</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Min Reorder Level</label>
            <input type="number" step="0.1" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newItem.min_stock_level} onChange={e => setNewItem({...newItem, min_stock_level: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Preferred Supplier</label>
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
          <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl text-xs hover:bg-gray-200 transition-all">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl text-xs hover:bg-slate-900 shadow-xl transition-all">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : modalType === 'edit_item' ? 'Save Changes' : 'Register Item'}
          </button>
        </div>
      </form>
    );
  }

  // Vendor Add / Edit
  return (
    <form onSubmit={modalType === 'edit_vendor' ? handleUpdateVendor : handleAddVendor} className="p-5 sm:p-6 pb-24 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Vendor Name</label>
          <input type="text" required placeholder="e.g. Sigma Aldrich" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} />
        </div>
        <div>
          <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Qualification Status</label>
          <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.status || 'Approved'} onChange={e => setNewVendor({...newVendor, status: e.target.value})}>
            <option value="Approved">Approved</option>
            <option value="Conditional">Conditional</option>
            <option value="Blacklisted">Blacklisted</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Contact Person</label>
          <input type="text" placeholder="Full Name" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.contact_person} onChange={e => setNewVendor({...newVendor, contact_person: e.target.value})} />
        </div>
        <div>
          <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Email</label>
          <input type="email" placeholder="sales@vendor.com" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.email} onChange={e => setNewVendor({...newVendor, email: e.target.value})} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Phone</label>
          <input type="text" placeholder="+12345678" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.phone} onChange={e => setNewVendor({...newVendor, phone: e.target.value})} />
        </div>
        <div>
          <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Payment Terms</label>
          <input type="text" placeholder="Net 30" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.payment_terms} onChange={e => setNewVendor({...newVendor, payment_terms: e.target.value})} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-black uppercase text-gray-400 tracking-widest mb-2">Address</label>
        <input type="text" placeholder="123 Lab Street" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newVendor.address} onChange={e => setNewVendor({...newVendor, address: e.target.value})} />
      </div>
      <div className="flex gap-3 pt-4 border-t border-gray-100">
        <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl text-xs hover:bg-gray-200 transition-all">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl text-xs hover:bg-slate-900 shadow-xl transition-all">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : modalType === 'edit_vendor' ? 'Save Changes' : 'Add Supplier'}
        </button>
      </div>
    </form>
  );
}
