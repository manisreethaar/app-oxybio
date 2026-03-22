'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CalendarDays, AlertTriangle, CheckCircle2, Plus, Clock } from 'lucide-react';
import { differenceInDays, format, addMonths, addYears, addWeeks } from 'date-fns';

export default function CompliancePage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, 'Title required'),
      category: z.string(),
      due_date: z.string().min(1, 'Date required'),
      responsible_person: z.string().optional(),
      is_recurring: z.boolean(),
      recurrence: z.string().optional()
    })),
    defaultValues: { title: '', category: 'FSSAI', due_date: '', responsible_person: '', is_recurring: false, recurrence: 'monthly' }
  });
  
  const watchedRecurring = watch('is_recurring');

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    if (employeeProfile) fetchCompliance();
  }, [employeeProfile]);

  const fetchCompliance = async () => {
    setLoading(true);
    try {
      const fetchPromises = [
        supabase.from('compliance_items').select('*, employees(full_name)').order('due_date', { ascending: true })
      ];
      if (role === 'admin') {
        fetchPromises.push(supabase.from('employees').select('id, full_name').eq('is_active', true));
      }

      const results = await Promise.all(fetchPromises);
      const compItems = results[0].data || [];

      const processedItems = compItems.map(i => {
        if (!i.due_date) return { ...i, calculated_status: i.status };
        const isOverdueState = i.status !== 'done' && differenceInDays(new Date(i.due_date), new Date()) < 0;
        return { ...i, calculated_status: isOverdueState ? 'overdue' : i.status };
      });
      
      setItems(processedItems);

      if (role === 'admin' && results[1]) {
        setEmployees(results[1].data || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data) => {
    if (actionLoading) return; setActionLoading(true);
    try {
      const res = await fetch('/api/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create item');
      setShowAdd(false); 
      reset(); 
      fetchCompliance();
    } catch (error) {
      alert('Failed to save item: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const markDone = async (item) => {
    try {
      const res = await fetch('/api/compliance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_done', item_id: item.id }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to mark done');
      fetchCompliance();
    } catch (err) {
      alert(err.message);
    }
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading compliance data...</div>;

  const overdue = items.filter(i => i.calculated_status === 'overdue');
  const thisWeek = items.filter(i => i.calculated_status !== 'done' && i.calculated_status !== 'overdue' && differenceInDays(new Date(i.due_date), new Date()) <= 7);
  const thisMonth = items.filter(i => i.calculated_status !== 'done' && i.calculated_status !== 'overdue' && differenceInDays(new Date(i.due_date), new Date()) > 7 && differenceInDays(new Date(i.due_date), new Date()) <= 30);
  const onTrack = items.filter(i => i.calculated_status !== 'done' && i.calculated_status !== 'overdue' && differenceInDays(new Date(i.due_date), new Date()) > 30);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Compliance Calendar</h1>
          <p className="text-gray-500 mt-1">Regulatory deadlines, renewals, and recurring tasks.</p>
        </div>
        {role === 'admin' && (
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 shadow-sm transition-colors">
            <Plus className="w-5 h-5 mr-1" /> Add Compliance Item
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-red-800 uppercase tracking-wider mb-2">Overdue</p>
          <p className="text-4xl font-black text-red-600">{overdue.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-2">&lt; 7 Days</p>
          <p className="text-4xl font-black text-amber-600">{thisWeek.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-blue-800 uppercase tracking-wider mb-2">&lt; 30 Days</p>
          <p className="text-4xl font-black text-blue-600">{thisMonth.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-green-800 uppercase tracking-wider mb-2">On Track</p>
          <p className="text-4xl font-black text-green-600">{onTrack.length}</p>
        </div>
      </div>

      {showAdd && role === 'admin' && (
        <form onSubmit={handleSubmit(handleCreate)} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm lg:w-2/3">
          <h2 className="text-xl font-bold text-gray-900 mb-6">New Compliance Requirement</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
              <input type="text" {...register('title')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" placeholder="e.g., FSSAI License Renewal" />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Category & Dept *</label>
              <select {...register('category')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500">
                {['FSSAI', 'TIIC', 'PF', 'ESI', 'Patent', 'NABL', 'Equipment', 'Lease', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Due Date *</label>
              <input type="date" {...register('due_date')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500" />
              {errors.due_date && <p className="text-red-500 text-xs mt-1">{errors.due_date.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Responsible Person</label>
              <select {...register('responsible_person')} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500">
                <option value="">Unassigned</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            
            <div className="md:col-span-2 flex items-center space-x-6 mt-2 pb-4 border-b border-gray-100">
              <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" {...register('is_recurring')} className="rounded text-teal-600 focus:ring-teal-500" />
                <span>Is Recurring?</span>
              </label>
              {watchedRecurring && (
                <select {...register('recurrence')} className="px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annually</option>
                </select>
              )}
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={() => { setShowAdd(false); reset(); }} className="px-5 py-2 hover:bg-gray-100 border border-transparent rounded-lg text-sm font-medium text-gray-700">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 bg-teal-800 text-white font-medium rounded-lg text-sm shadow-sm hover:bg-teal-900 disabled:opacity-50">Save Item</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {items.map((item) => {
            const daysTo = differenceInDays(new Date(item.due_date), new Date());
            const statusColor = 
              item.calculated_status === 'overdue' ? 'bg-red-50' :
              item.calculated_status === 'done' ? 'bg-gray-50 opacity-60' : '';
              
            const badgeColor = 
              item.calculated_status === 'overdue' ? 'bg-red-100 text-red-800 border-red-200' :
              item.calculated_status === 'done' ? 'bg-gray-200 text-gray-600 border-gray-300' :
              daysTo <= 7 ? 'bg-amber-100 text-amber-800 border-amber-200' :
              daysTo <= 30 ? 'bg-blue-100 text-blue-800 border-blue-200' :
              'bg-green-100 text-green-800 border-green-200';

            return (
              <li key={item.id} className={`p-6 transition-colors hover:bg-gray-50 flex flex-col md:flex-row justify-between md:items-center ${statusColor}`}>
                <div className="mb-4 md:mb-0">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded border ${badgeColor}`}>
                      {item.calculated_status === 'overdue' ? 'OVERDUE' : item.calculated_status === 'done' ? 'DONE' : `${daysTo} days left`}
                    </span>
                    {item.is_recurring && <span className="text-[10px] font-bold uppercase text-teal-700 tracking-widest bg-teal-50 px-2 py-0.5 rounded">{item.recurrence}</span>}
                  </div>
                  <h3 className={`text-lg font-bold ${item.calculated_status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>{item.title}</h3>
                  <div className="flex flex-wrap items-center mt-2 text-sm text-gray-500 gap-4">
                    <div className="flex items-center"><CalendarDays className="w-4 h-4 mr-1.5" /> Due: {format(new Date(item.due_date), 'MMM d, yyyy')}</div>
                    {item.employees && <div className="flex items-center border-l border-gray-300 pl-4 text-gray-700">Assigned: <strong className="ml-1">{item.employees.full_name}</strong></div>}
                  </div>
                </div>
                
                {role === 'admin' && item.calculated_status !== 'done' && (
                  <button onClick={() => markDone(item)} className="px-4 py-2 mt-2 md:mt-0 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-green-700 font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> Mark Done
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
