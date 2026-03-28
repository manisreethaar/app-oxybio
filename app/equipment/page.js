'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Shield, Settings, Calendar, AlertTriangle, CheckCircle, Plus, Loader2, Save, Wrench, Thermometer, Database } from 'lucide-react';

const equipSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  calibration_due_date: z.string().optional().or(z.literal('')),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance']).default('Operational')
});

const maintSchema = z.object({
  equipment_id: z.string().uuid(),
  calibration_date: z.string().min(1, "Calibration date is required"),
  next_due_date: z.string().optional().or(z.literal('')),
  result: z.string().min(1, "Notes are required"),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance'])
});

export default function EquipmentPage() {
  const { role, canDo, employeeProfile, loading: authLoading } = useAuth();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Maintenance Modal State
  const [activeDevice, setActiveDevice] = useState(null);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  
  // REACT HOOK FORM SETUPS
  const { register: regEquip, handleSubmit: handEquip, formState: { errors: eqErrors, isSubmitting: isEqSubmitting }, reset: resetEquip } = useForm({
    resolver: zodResolver(equipSchema),
    defaultValues: { name: '', model: '', serial_number: '', calibration_due_date: '', status: 'Operational' }
  });

  const { register: regMaint, handleSubmit: handMaint, formState: { errors: mxErrors, isSubmitting: isMxSubmitting }, reset: resetMaint, setValue: setMaintValue } = useForm({
    resolver: zodResolver(maintSchema),
    defaultValues: { calibration_date: new Date().toISOString().split('T')[0], next_due_date: '', result: '', status: 'Operational' }
  });

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('equipment').select('*, calibration_logs(*)').order('name');
      if (error) throw error;
      setEquipment(data || []);
    } catch (err) { console.error('Fetch equipment error:', err); }
    finally { setLoading(false); }
  };


  const onSubmitEquipment = async (data) => {
    try {
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        resetEquip();
        await fetchEquipment();
      } else {
        alert("Failed to register: " + resData.error);
      }
    } catch (err) {
      alert("Network error: " + err.message);
    }
  };

  const onSubmitMaintenance = async (data) => {
    try {
      const res = await fetch('/api/equipment/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (res.ok) {
        setIsMaintenanceOpen(false);
        setActiveDevice(null);
        resetMaint();
        await fetchEquipment();
      } else {
        alert("Database error saving log: " + resData.error);
      }
    } catch (err) {
      alert("Database error saving log: " + err.message);
    }
  };

  if (authLoading || loading) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-10 h-10 animate-spin text-teal-800" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-teal-950 font-mono tracking-tighter">Equipment Master Registry</h1>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-1">ISO 9001 Compliance Dashboard</p>
        </div>
        {canDo('equipment', 'create') && (
          <button onClick={() => setIsModalOpen(true)} className="flex items-center px-6 py-3 bg-teal-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-teal-900/20 hover:bg-teal-900 transition-all active:scale-95">
            <Plus className="w-4 h-4 mr-2" /> Add New Equipment
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {equipment.map((device) => {
          const isCalibrationDue = device.calibration_due_date && (new Date(device.calibration_due_date) < new Date());
          const isNearDue = device.calibration_due_date && (new Date(device.calibration_due_date) - new Date() < 14 * 24 * 60 * 60 * 1000);

          return (
            <div key={device.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:shadow-teal-950/5 transition-all">
              <div className={`p-6 ${device.status === 'Operational' ? 'bg-teal-50/50' : 'bg-red-50/50'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-teal-800 border border-gray-100">
                    <Database className="w-6 h-6" />
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${device.status === 'Operational' ? 'bg-teal-700 text-white' : 'bg-red-600 text-white'}`}>
                    {device.status}
                  </span>
                </div>
                <h3 className="text-xl font-black text-teal-950 mb-1">{device.name}</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{device.model || 'Standard Unit'} — {device.serial_number || 'SN-UNKNOWN'}</p>
              </div>

              <div className="p-6 flex-1 space-y-4">
                <div className={`p-4 rounded-2xl border ${isCalibrationDue ? 'bg-red-50 border-red-100' : isNearDue ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Calibration Sync</p>
                    {isCalibrationDue ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <Shield className="w-4 h-4 text-teal-600" />}
                  </div>
                  <p className={`text-lg font-black font-mono tracking-tighter ${isCalibrationDue ? 'text-red-700' : 'text-teal-900'}`}>
                    {device.calibration_due_date ? new Date(device.calibration_due_date).toLocaleDateString() : 'NO SCHEDULE'}
                  </p>
                  <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase">ISO Compliance Deadline</p>
                </div>

                <div className="flex gap-2">
                  <button 
                    disabled={!canDo('equipment', 'edit')}
                    onClick={() => { setActiveDevice(device); setMaintValue('status', device.status); setMaintValue('equipment_id', device.id); setIsMaintenanceOpen(true); }} 
                    className="flex-1 py-3 bg-white border border-gray-200 text-teal-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      Log Maintenance
                  </button>
                  <button 
                    disabled={!canDo('equipment', 'edit')}
                    onClick={() => { setActiveDevice(device); setMaintValue('status', 'Operational'); setMaintValue('equipment_id', device.id); setIsMaintenanceOpen(true); }} 
                    className="flex-1 py-3 bg-teal-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-900 shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                      Calibrate Now
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-teal-950/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-teal-800 text-white">
              <h2 className="text-xl font-black tracking-tight">Register Laboratory Asset</h2>
              <p className="text-teal-300 text-[10px] font-bold uppercase tracking-widest mt-1">Asset Control - IDMS v2</p>
            </div>
            <form onSubmit={handEquip(onSubmitEquipment)} className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Equipment Name</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                  {...regEquip('name')} placeholder="e.g. Bioreactor 01" />
                {eqErrors.name && <p className="text-red-500 text-xs mt-1">{eqErrors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Model / Brand</label>
                  <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                    {...regEquip('model')} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Serial Number</label>
                  <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold font-mono" 
                    {...regEquip('serial_number')} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Next Calibration Due</label>
                <input type="date" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                  {...regEquip('calibration_due_date')} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Initial Status</label>
                <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                  {...regEquip('status')}>
                  <option value="Operational">Operational</option>
                  <option value="Out of Service">Out of Service</option>
                  <option value="Under Maintenance">Under Maintenance</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                <button type="submit" disabled={isEqSubmitting} className="flex-2 py-4 px-8 bg-teal-800 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-teal-900 shadow-xl shadow-teal-950/20 transition-all active:scale-95 flex items-center justify-center">
                  {isEqSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMaintenanceOpen && activeDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-teal-950/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-slate-800 text-white">
              <h2 className="text-xl font-black tracking-tight">{activeDevice.name}</h2>
              <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest mt-1">Maintenance & Calibration Log</p>
            </div>
            <form onSubmit={handMaint(onSubmitMaintenance)} className="p-8 space-y-5">
              <input type="hidden" {...regMaint('equipment_id')} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Log Date</label>
                  <input type="date" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                    {...regMaint('calibration_date')} />
                  {mxErrors.calibration_date && <p className="text-red-500 text-xs mt-1">{mxErrors.calibration_date.message}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Next Due Date</label>
                  <input type="date" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                    {...regMaint('next_due_date')} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Equipment Status</label>
                <select className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold" 
                  {...regMaint('status')}>
                  <option value="Operational">Operational</option>
                  <option value="Out of Service">Out of Service</option>
                  <option value="Under Maintenance">Under Maintenance</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Notes & Results</label>
                <textarea rows="3" className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-4 focus:ring-teal-100 text-sm font-bold resize-none" 
                  {...regMaint('result')} placeholder="Maintenance performed..."/>
                {mxErrors.result && <p className="text-red-500 text-xs mt-1">{mxErrors.result.message}</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsMaintenanceOpen(false); setActiveDevice(null); resetMaint(); }} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                <button type="submit" disabled={isMxSubmitting} className="flex-2 py-4 px-8 bg-slate-800 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-slate-900 shadow-xl shadow-slate-950/20 transition-all active:scale-95 flex items-center justify-center">
                  {isMxSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
