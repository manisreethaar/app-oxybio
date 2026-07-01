'use client';
import { Loader2, FileText, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Package } from 'lucide-react';

interface StockModalProps {
  modalType: string;
  items: any[];
  vendors: any[];
  stock: any[];
  newStock: any;
  setNewStock: (v: any) => void;
  newIssue: any;
  setNewIssue: (v: any) => void;
  isSubmitting: boolean;
  uploadingCoA: boolean;
  uploadingSDS: boolean;
  trainingStatus: { isTrained: boolean };
  role: string;
  handleAddStock: (e: any) => void;
  handleUpdateStock: (e: any) => void;
  handleIssueStock: (e: any) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'coa' | 'sds') => void;
  onClose: () => void;
}

export default function StockModal({
  modalType, items, vendors, stock, newStock, setNewStock,
  newIssue, setNewIssue, isSubmitting, uploadingCoA, uploadingSDS,
  trainingStatus, role, handleAddStock, handleUpdateStock,
  handleIssueStock, handleFileChange, onClose,
}: StockModalProps) {

  // Training gate for non-admin stock receipt
  if (modalType === 'stock' && !trainingStatus.isTrained && !['admin', 'research_fellow', 'scientist'].includes(role)) {
    return (
      <div className="p-12 bg-white flex flex-col items-center text-center gap-6">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center"><Package className="w-10 h-10 text-amber-500" /></div>
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Training Required</h3>
          <p className="text-sm text-slate-500 font-medium mt-2 max-w-xs mx-auto">To maintain GMP compliance, you must read and sign the <b>Sanitation SOP</b> before handling warehouse stock.</p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <Link href="/sops" className="w-full py-4 bg-slate-800 text-white font-black rounded-2xl shadow-lg hover:bg-slate-900 transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">Open SOP Library</Link>
          <button onClick={onClose} className="text-xs font-bold text-slate-400 hover:text-slate-600">Close Window</button>
        </div>
      </div>
    );
  }

  // Stock Receive / Edit Form
  if (modalType === 'stock' || modalType === 'edit_stock') {
    return (
      <form onSubmit={modalType === 'edit_stock' ? handleUpdateStock : handleAddStock} className="p-5 sm:p-6 pb-24 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
        <div className="grid grid-cols-1 gap-5">
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Inventory Item</label>
            <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold disabled:opacity-50"
              value={newStock.item_id} onChange={(e) => setNewStock({...newStock, item_id: e.target.value})} disabled={modalType === 'edit_stock'}>
              <option value="">Select Item...</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Supplier / Vendor</label>
            <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold"
              value={newStock.vendor_id} onChange={(e) => setNewStock({...newStock, vendor_id: e.target.value})}>
              <option value="">Select Supplier...</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">{modalType === 'edit_stock' ? 'Current Quantity' : 'Quantity Recvd'}</label>
              <input type="number" step="0.01" required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold"
                value={newStock.received_quantity} onChange={(e) => setNewStock({...newStock, received_quantity: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Supplier Batch #</label>
              <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold font-mono"
                value={newStock.supplier_batch_number} onChange={(e) => setNewStock({...newStock, supplier_batch_number: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Expiry Date</label>
              <input type="date" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold"
                value={newStock.expiry_date} onChange={(e) => setNewStock({...newStock, expiry_date: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Warehouse Location</label>
              <input type="text" placeholder="e.g. Shelf A1" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold"
                value={newStock.location} onChange={(e) => setNewStock({...newStock, location: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">PO Number (Optional)</label>
              <input type="text" placeholder="PO-123" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.purchase_order_number} onChange={e => setNewStock({...newStock, purchase_order_number: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Invoice / Delivery Ref</label>
              <input type="text" placeholder="INV-456" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.invoice_ref} onChange={e => setNewStock({...newStock, invoice_ref: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Initial Status</label>
              <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.status || 'Available'} onChange={e => setNewStock({...newStock, status: e.target.value})}>
                <option value="Available">Available (Ready to Use)</option>
                <option value="Quarantined">Quarantined (Pending QC)</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-2">
                CoA Document {uploadingCoA && <Loader2 className="w-3 h-3 animate-spin text-slate-600"/>}
              </label>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(e, 'coa')} className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer" />
              {newStock.coa_url && (
                <div className="mt-2">
                  <span className="text-[10px] text-green-600 font-bold flex items-center gap-1"><FileText className="w-3 h-3"/> Uploaded</span>
                  <input type="date" className="mt-2 w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.coa_expiry_date || ''} onChange={e => setNewStock({...newStock, coa_expiry_date: e.target.value})} title="CoA Expiry Date" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-2">
                SDS Document {uploadingSDS && <Loader2 className="w-3 h-3 animate-spin text-amber-600"/>}
              </label>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileChange(e, 'sds')} className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer" />
              {newStock.sds_url && (
                <div className="mt-2">
                  <span className="text-[10px] text-green-600 font-bold flex items-center gap-1"><FileText className="w-3 h-3"/> Uploaded</span>
                  <input type="date" className="mt-2 w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newStock.sds_expiry_date || ''} onChange={e => setNewStock({...newStock, sds_expiry_date: e.target.value})} title="SDS Expiry Date" />
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Notes</label>
            <textarea rows={2} placeholder="General receipt notes..." className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold resize-none" value={newStock.notes} onChange={e => setNewStock({...newStock, notes: e.target.value})} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-slate-900 shadow-xl shadow-slate-950/20 transition-all active:scale-95 flex items-center justify-center">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : modalType === 'edit_stock' ? 'Save Changes' : 'Log Entry'}
          </button>
        </div>
      </form>
    );
  }

  // Issue Stock Form
  if (modalType === 'issue') {
    return (
      <form onSubmit={handleIssueStock} className="p-5 sm:p-6 pb-24 space-y-5 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
        <div>
          <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Select Stock Item</label>
          <select required className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 text-sm font-bold" value={newIssue.stock_id} onChange={e => setNewIssue({...newIssue, stock_id: e.target.value})}>
            <option value="">Select Item...</option>
            {stock.filter(s => s.status === 'Available').map(s => (
              <option key={s.id} value={s.id}>{s.inventory_items?.name} (Lot: {s.supplier_batch_number || 'N/A'}) - Avail: {s.current_quantity}{s.inventory_items?.unit}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl text-[10px] hover:bg-slate-900 shadow-xl transition-all">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Issue Stock'}
          </button>
        </div>
      </form>
    );
  }

  return null;
}
