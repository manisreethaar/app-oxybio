'use client';
import { useState, useEffect } from 'react';
import { ShoppingCart, CheckCircle, XCircle, Clock, AlertTriangle, Plus } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function PurchaseRequestsTab({ canApprove }: { canApprove: boolean }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const [form, setForm] = useState({
    item_name: '', requested_quantity: '', unit: '', reason: '', urgency: 'Normal'
  });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/purchase-request');
      const json = await res.json();
      if (json.success) setRequests(json.data);
      else toast.error(json.error || 'Failed to load requests');
    } catch (e) { toast.error('Network error'); }
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/purchase-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Purchase Request created!');
        setShowModal(false);
        setForm({ item_name: '', requested_quantity: '', unit: '', reason: '', urgency: 'Normal' });
        fetchRequests();
      } else toast.error(json.error);
    } catch (e) { toast.error('Failed to submit'); }
    finally { setIsSubmitting(false); }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/inventory/purchase-request', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Request ${status}`);
        fetchRequests();
      } else toast.error(json.error);
    } catch (e) { toast.error('Update failed'); }
  };

  if (loading) return <div className="p-8 text-center text-gray-400 font-bold">Loading requests...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-gray-800">Purchase Requisitions (PR)</h2>
        <button onClick={() => setShowModal(true)} className="flex items-center px-4 py-2 bg-slate-600 text-white font-bold rounded-xl hover:bg-slate-700">
          <Plus className="w-4 h-4 mr-2" /> New Request
        </button>
      </div>

      <div className="grid gap-4">
        {requests.map((r: any) => (
          <div key={r.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="font-bold text-gray-900">{r.item_name}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded bg-gray-100 text-gray-600">Qty: {r.requested_quantity} {r.unit}</span>
                {r.urgency === 'High' && <span className="flex items-center text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded uppercase"><AlertTriangle className="w-3 h-3 mr-1" /> High Urgency</span>}
              </div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Requested by {r.requester?.full_name} • {new Date(r.created_at).toLocaleDateString()}</p>
              {r.reason && <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg italic">"{r.reason}"</p>}
            </div>
            
            <div className="flex flex-col items-end gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                r.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                r.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                r.status === 'Fulfilled' ? 'bg-slate-200 text-slate-900' :
                'bg-amber-100 text-amber-800'
              }`}>
                {r.status}
              </span>
              
              {canApprove && r.status === 'Pending' && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleStatus(r.id, 'Approved')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-black uppercase flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" /> Approve
                  </button>
                  <button onClick={() => handleStatus(r.id, 'Rejected')} className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-[10px] font-black uppercase flex items-center">
                    <XCircle className="w-3 h-3 mr-1" /> Reject
                  </button>
                </div>
              )}
              {canApprove && r.status === 'Approved' && (
                <button onClick={() => handleStatus(r.id, 'Fulfilled')} className="mt-2 px-3 py-1.5 bg-slate-100 text-slate-900 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase flex items-center">
                  <ShoppingCart className="w-3 h-3 mr-1" /> Mark Fulfilled
                </button>
              )}
            </div>
          </div>
        ))}
        {requests.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-bold text-gray-400">No purchase requests found.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-black text-gray-800">New Purchase Request</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Item Name *</label>
                <input required value={form.item_name} onChange={e=>setForm({...form, item_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-slate-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantity *</label>
                  <input required type="number" step="0.01" value={form.requested_quantity} onChange={e=>setForm({...form, requested_quantity: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit</label>
                  <input value={form.unit} onChange={e=>setForm({...form, unit: e.target.value})} placeholder="e.g. kg, L" className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reason / Justification</label>
                <textarea value={form.reason} onChange={e=>setForm({...form, reason: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-slate-500" rows={3}></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Urgency</label>
                <select value={form.urgency} onChange={e=>setForm({...form, urgency: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-slate-500">
                  <option value="Normal">Normal</option>
                  <option value="High">High (Urgent)</option>
                </select>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 text-sm font-bold text-white bg-slate-600 hover:bg-slate-700 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? 'Submitting...' : 'Submit PR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
