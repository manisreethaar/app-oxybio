'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Shield, Settings, Calendar, AlertTriangle, CheckCircle, Plus, Loader2, Save, Wrench, Thermometer, Database, Trash2, X, Search } from 'lucide-react';
import Link from 'next/link';
import CreatorBadge from '@/components/ui/CreatorBadge';

const equipSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  requires_calibration: z.boolean().default(false),
  calibration_due_date: z.string().optional().or(z.literal('')),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance']).default('Operational'),
  iq_doc_url: z.string().optional().or(z.literal('')),
  oq_doc_url: z.string().optional().or(z.literal('')),
  pq_doc_url: z.string().optional().or(z.literal('')),
});

const maintSchema = z.object({
  equipment_id: z.string().uuid(),
  calibration_date: z.string().min(1, "Calibration date is required"),
  next_due_date: z.string().optional().or(z.literal('')),
  log_type: z.enum(['Calibration', 'Maintenance', 'Cleaning', 'Usage']).default('Calibration'),
  result: z.string().min(1, "Notes are required"),
  buffer_values_used: z.string().optional(),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance'])
});

const ticketSchema = z.object({
  equipment_id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium')
});

export default function EquipmentPage() {
  const { role, isAdmin, canDo, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'

  
  // Maintenance Modal State
  const [activeDevice, setActiveDevice] = useState(null);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  
  // Ticket Modal State
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  
  const [deletingId, setDeletingId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [batchUsageMap, setBatchUsageMap] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('name');
  
  // REACT HOOK FORM SETUPS
  const { register: regEquip, handleSubmit: handEquip, formState: { errors: eqErrors, isSubmitting: isEqSubmitting }, reset: resetEquip, control: equipControl } = useForm({
    resolver: zodResolver(equipSchema),
    defaultValues: { name: '', model: '', serial_number: '', requires_calibration: false, calibration_due_date: '', status: 'Operational', iq_doc_url: '', oq_doc_url: '', pq_doc_url: '' }
  });

  const watchRequiresCalibration = useWatch({ control: equipControl, name: 'requires_calibration' });

  const { register: regMaint, handleSubmit: handMaint, formState: { errors: mxErrors, isSubmitting: isMxSubmitting }, reset: resetMaint, setValue: setMaintValue } = useForm({
    resolver: zodResolver(maintSchema),
    defaultValues: { calibration_date: new Date().toISOString().split('T')[0], next_due_date: '', log_type: 'Calibration', result: '', buffer_values_used: '', status: 'Operational' }
  });

  const { register: regTicket, handleSubmit: handTicket, formState: { errors: tktErrors, isSubmitting: isTktSubmitting }, reset: resetTicket, setValue: setTicketValue } = useForm({
    resolver: zodResolver(ticketSchema),
    defaultValues: { title: '', description: '', severity: 'Medium' }
  });

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    fetchEquipment();

    const channel = supabase.channel('equipment_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, () => fetchEquipment())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_logs' }, () => fetchEquipment())
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const [{ data: eqData, error: eqErr }, { data: sterilData }] = await Promise.all([
        supabase.from('equipment').select('*, calibration_logs(*, employees:logged_by(full_name, initials))').order('name'),
        supabase.from('batch_stage_sterilisation').select('equipment_id, batches(id, batch_id, status)').order('created_at', { ascending: false }).limit(300)
      ]);
      if (eqErr) throw eqErr;
      setEquipment(eqData || []);
      const usageMap = {};
      (sterilData || []).forEach(row => {
        if (!usageMap[row.equipment_id] && row.batches) usageMap[row.equipment_id] = row.batches;
      });
      setBatchUsageMap(usageMap);
    } catch (err) { console.error('Fetch equipment error:', err); }
    finally { setLoading(false); }
  };


  const onSubmitEquipment = async (data) => {
    try {
      const isEdit = modalMode === 'edit';
      const endpoint = isEdit ? '/api/equipment' : '/api/equipment';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = isEdit ? { ...data, id: activeDevice.id } : data;

      const res = await fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        resetEquip();
        setActiveDevice(null);
        await fetchEquipment();
      } else {
        toast.error("Action failed: " + resData.error);
      }
    } catch (err) {
      toast.error("Network error: " + err.message);
    }
  };

  const onSubmitMaintenance = async (data) => {
    try {
      const res = await fetch('/api/equipment/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success("Maintenance logged.");
        setIsMaintenanceOpen(false);
        resetMaint();
        fetchEquipment();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to log maintenance');
      }
    } catch (e) { toast.error("Error logging maintenance."); }
  };

  const onSubmitTicket = async (data) => {
    try {
      const res = await fetch('/api/equipment/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success("Issue reported successfully.");
        setIsTicketOpen(false);
        resetTicket();
        fetchEquipment();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to report issue');
      }
    } catch (e) { toast.error("Error reporting issue."); }
  };

  const handleDeleteEquipment = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/equipment?id=${deletingId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setEquipment(equipment.filter((d) => d.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      toast.error("Failed to delete: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredEquipment = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return equipment
      .filter(device => {
        const matchesStatus = statusFilter === 'All' || device.status === statusFilter;
        const matchesSearch = !q || [
          device.name,
          device.model,
          device.serial_number,
          device.status,
          batchUsageMap[device.id]?.batch_id
        ].some(value => String(value || '').toLowerCase().includes(q));
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOrder === 'due') return new Date(a.calibration_due_date || '9999-12-31') - new Date(b.calibration_due_date || '9999-12-31');
        if (sortOrder === 'status') return (a.status || '').localeCompare(b.status || '');
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [equipment, searchTerm, statusFilter, sortOrder, batchUsageMap]);


  if (loading) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-10 h-10 animate-spin text-slate-800" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Equipment Master Registry</h1>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">ISO 9001 Compliance Dashboard</p>
        </div>
        {isAdmin && (
          <button onClick={() => setIsModalOpen(true)} className="flex items-center px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/20 hover:bg-slate-900 transition-all active:scale-95">
            <Plus className="w-4 h-4 mr-2" /> Add New Equipment
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search equipment, model, serial, or batch..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 uppercase outline-none">
          <option value="All">All Statuses</option>
          <option value="Operational">Operational</option>
          <option value="Under Maintenance">Under Maintenance</option>
          <option value="Out of Service">Out of Service</option>
        </select>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 uppercase outline-none">
          <option value="name">Name A-Z</option>
          <option value="due">Calibration Due</option>
          <option value="status">Status</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredEquipment.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-sm font-bold text-slate-400">
            No equipment matches the current search.
          </div>
        ) : filteredEquipment.map((device) => {
          const isCalibrationDue = device.calibration_due_date && (new Date(device.calibration_due_date) < new Date());
          const isNearDue = device.calibration_due_date && (new Date(device.calibration_due_date) - new Date() < 14 * 24 * 60 * 60 * 1000);

          return (
            <div key={device.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:shadow-slate-950/5 transition-all">
              <div className={`p-6 ${device.status === 'Operational' ? 'bg-slate-50/50' : 'bg-red-50/50'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-800 border border-slate-100">
                    <Database className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${device.status === 'Operational' ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`}>
                      {device.status}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setModalMode('edit'); setActiveDevice(device); resetEquip({...device}); setIsModalOpen(true); }}
                          className="text-xs font-black text-slate-600 hover:text-slate-800 uppercase tracking-widest bg-white px-2 py-1 rounded-lg border border-slate-100 shadow-sm transition-all"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => setDeletingId(device.id)}
                          className="p-1 rounded-lg bg-red-50 text-red-400 hover:text-red-600 transition-all border border-red-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <h3 className="text-xl font-black text-slate-950 mb-1 leading-tight">{device.name}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{device.model || 'Standard Unit'} — {device.serial_number || 'SN-UNKNOWN'}</p>
                  {(() => {
                    const logs = device.calibration_logs || [];
                    const latest = logs.sort((a, b) => new Date(b.calibration_date || 0) - new Date(a.calibration_date || 0))[0];
                    return latest?.employees ? (
                      <CreatorBadge initials={latest.employees.initials} fullName={latest.employees.full_name} />
                    ) : null;
                  })()}
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  {device.requires_calibration && (
                    <div className={`p-4 rounded-2xl border ${isCalibrationDue ? 'bg-red-50 border-red-100' : isNearDue ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Calib. Due</p>
                        {isCalibrationDue ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <Shield className="w-4 h-4 text-slate-600" />}
                      </div>
                      <p className={`text-sm font-black font-mono tracking-tighter ${isCalibrationDue ? 'text-red-700' : 'text-slate-900'}`}>
                        {device.calibration_due_date ? new Date(device.calibration_due_date).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  )}
                  
                  {(() => {
                    const isPmDue = device.next_pm_date && (new Date(device.next_pm_date) < new Date());
                    return (
                      <div className={`p-4 rounded-2xl border ${isPmDue ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">PM Due</p>
                          {isPmDue && <AlertTriangle className="w-4 h-4 text-red-600" />}
                        </div>
                        <p className={`text-sm font-black font-mono tracking-tighter ${isPmDue ? 'text-red-700' : 'text-slate-900'}`}>
                          {device.next_pm_date ? new Date(device.next_pm_date).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {batchUsageMap[device.id] && (
                  <div className="px-4 py-3 bg-navy/5 rounded-2xl border border-navy/10">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Last used in</p>
                    <div className="flex items-center justify-between">
                      <Link href={`/batches/${batchUsageMap[device.id].id}`} className="text-xs font-black text-navy hover:underline font-mono tracking-wider">
                        {batchUsageMap[device.id].batch_id}
                      </Link>
                      {batchUsageMap[device.id].status === 'active' && (
                        <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase">Active</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Qualification Docs */}
                {(device.iq_doc_url || device.oq_doc_url || device.pq_doc_url) && (
                  <div className="flex flex-wrap gap-2">
                    {device.iq_doc_url && (
                      <a href={device.iq_doc_url} target="_blank" rel="noreferrer" className="flex-1 px-2 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest text-center hover:bg-slate-100 border border-slate-100 transition-all flex items-center justify-center gap-1">
                        IQ Doc
                      </a>
                    )}
                    {device.oq_doc_url && (
                      <a href={device.oq_doc_url} target="_blank" rel="noreferrer" className="flex-1 px-2 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest text-center hover:bg-slate-100 border border-slate-100 transition-all flex items-center justify-center gap-1">
                        OQ Doc
                      </a>
                    )}
                    {device.pq_doc_url && (
                      <a href={device.pq_doc_url} target="_blank" rel="noreferrer" className="flex-1 px-2 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest text-center hover:bg-slate-100 border border-slate-100 transition-all flex items-center justify-center gap-1">
                        PQ Doc
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-auto flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      disabled={!['admin', 'ceo', 'cto'].includes(role)}
                      onClick={() => { setActiveDevice(device); setMaintValue('status', device.status); setMaintValue('equipment_id', device.id); setMaintValue('log_type', device.requires_calibration ? 'Calibration' : 'Maintenance'); setIsMaintenanceOpen(true); }}
                      className="flex-1 py-3 bg-white border border-slate-200 text-slate-800 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        Log Maintenance
                    </button>
                    {device.requires_calibration && (
                      <button 
                        disabled={!['admin', 'ceo', 'cto'].includes(role)}
                        onClick={() => { setActiveDevice(device); setMaintValue('status', 'Operational'); setMaintValue('equipment_id', device.id); setMaintValue('log_type', 'Calibration'); setIsMaintenanceOpen(true); }} 
                        className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                          Calibrate Now
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => { setActiveDevice(device); setTicketValue('equipment_id', device.id); setIsTicketOpen(true); }} 
                    className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> Report Issue
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-50/10 backdrop-blur-sm">
          <div className="h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-slate-800 text-white">
              <h2 className="text-xl font-black tracking-tight">{modalMode === 'edit' ? 'Edit Laboratory Asset' : 'Register Laboratory Asset'}</h2>
              <p className="text-slate-300 text-xs font-bold uppercase tracking-widest mt-1">{modalMode === 'edit' ? 'Update Compliance Details' : 'Asset Control - IDMS v2'}</p>
            </div>
            <form onSubmit={handEquip(onSubmitEquipment)} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Equipment Name</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                  {...regEquip('name')} placeholder="e.g. Bioreactor 01" />
                {eqErrors.name && <p className="text-red-500 text-xs mt-1">{eqErrors.name.message}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Model / Brand</label>
                  <input type="text" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regEquip('model')} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Serial Number</label>
                  <input type="text" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold font-mono" 
                    {...regEquip('serial_number')} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Next PM Due Date</label>
                  <input type="date" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regEquip('next_pm_date')} />
                </div>
              </div>
              {/* Calibration Toggle */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl ring-1 ring-slate-200">
                <div>
                  <p className="text-sm font-black text-slate-800">Requires Calibration</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Enable for pH meters, balances, thermometers, etc.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" {...regEquip('requires_calibration')} />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
                </label>
              </div>
              {/* Calibration Date — only shown when toggle is on */}
              {watchRequiresCalibration && (
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Next Calibration Due</label>
                  <input type="date" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regEquip('calibration_due_date')} />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">PM Frequency (Days)</label>
                  <input type="number" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regEquip('pm_frequency_days', { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Initial Status</label>
                  <select className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regEquip('status')}>
                    <option value="Operational">Operational</option>
                    <option value="Out of Service">Out of Service</option>
                    <option value="Under Maintenance">Under Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">IQ Document URL</label>
                  <input type="text" placeholder="https://..." className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-xs font-bold" 
                    {...regEquip('iq_doc_url')} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">OQ Document URL</label>
                  <input type="text" placeholder="https://..." className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-xs font-bold" 
                    {...regEquip('oq_doc_url')} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">PQ Document URL</label>
                  <input type="text" placeholder="https://..." className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-xs font-bold" 
                    {...regEquip('pq_doc_url')} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsModalOpen(false); resetEquip(); setActiveDevice(null); }} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" disabled={isEqSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-900 shadow-xl shadow-slate-950/20 transition-all active:scale-95 flex items-center justify-center">
                  {isEqSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : modalMode === 'edit' ? 'Save Asset Changes' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMaintenanceOpen && activeDevice && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-50/10 backdrop-blur-sm">
          <div className="h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-slate-800 text-white">
              <h2 className="text-xl font-black tracking-tight">{activeDevice.name}</h2>
              <p className="text-slate-300 text-xs font-bold uppercase tracking-widest mt-1">Maintenance &amp; Calibration Log</p>
            </div>
            <form onSubmit={handMaint(onSubmitMaintenance)} className="p-8 space-y-5">
              <input type="hidden" {...regMaint('equipment_id')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Log Date</label>
                  <input type="date" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regMaint('calibration_date')} />
                  {mxErrors.calibration_date && <p className="text-red-500 text-xs mt-1">{mxErrors.calibration_date.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Next Due Date</label>
                  <input type="date" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regMaint('next_due_date')} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Log Type</label>
                  <select className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regMaint('log_type')}>
                    <option value="Calibration">Calibration</option>
                    <option value="Maintenance">Preventive Maintenance</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Usage">Usage</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Equipment Status</label>
                  <select className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                    {...regMaint('status')}>
                    <option value="Operational">Operational</option>
                    <option value="Out of Service">Out of Service</option>
                    <option value="Under Maintenance">Under Maintenance</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Notes / Results</label>
                <textarea className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold min-h-[100px]" 
                  {...regMaint('result')} placeholder="Enter findings or notes..." />
                {mxErrors.result && <p className="text-red-500 text-xs mt-1">{mxErrors.result.message}</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsMaintenanceOpen(false); resetMaint(); setActiveDevice(null); }} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" disabled={isMxSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-900 shadow-xl shadow-slate-950/20 transition-all active:scale-95 flex items-center justify-center">
                  {isMxSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Log Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isTicketOpen && activeDevice && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-50/10 backdrop-blur-sm">
          <div className="h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-red-600 text-white flex items-center gap-4">
              <AlertTriangle className="w-8 h-8 text-red-200" />
              <div>
                <h2 className="text-xl font-black tracking-tight">Report Issue: {activeDevice.name}</h2>
                <p className="text-red-200 text-xs font-bold uppercase tracking-widest mt-1">Breakdown Ticketing System</p>
              </div>
            </div>
            <form onSubmit={handTicket(onSubmitTicket)} className="p-8 space-y-5">
              <input type="hidden" {...regTicket('equipment_id')} />
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Issue Title</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                  {...regTicket('title')} placeholder="e.g. Temperature fluctuating widely" />
                {tktErrors.title && <p className="text-red-500 text-xs mt-1">{tktErrors.title.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Severity</label>
                <select className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold" 
                  {...regTicket('severity')}>
                  <option value="Low">Low (Operational, minor issue)</option>
                  <option value="Medium">Medium (Operational but needs attention)</option>
                  <option value="High">High (Partially degraded)</option>
                  <option value="Critical">Critical (Out of Service)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Description</label>
                <textarea className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-4 focus:ring-slate-100 text-sm font-bold min-h-[100px]" 
                  {...regTicket('description')} placeholder="Provide details..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsTicketOpen(false); resetTicket(); setActiveDevice(null); }} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" disabled={isTktSubmitting} className="flex-2 py-4 px-8 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-red-700 shadow-xl shadow-red-950/20 transition-all active:scale-95 flex items-center justify-center">
                  {isTktSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-50/10 backdrop-blur-sm">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2.5rem] p-6 md:p-5 md:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Decommission Asset?</h2>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              This will permanently remove the equipment and all its calibration/maintenance history from the registry.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteEquipment}
                disabled={isDeleting}
                className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-red-700 shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Removal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
