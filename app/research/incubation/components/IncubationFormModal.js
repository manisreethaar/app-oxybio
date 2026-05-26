'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Save, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const formSchema = z.object({
  sample_name: z.string().min(1, 'Sample name is required'),
  batch_id: z.string().optional(),
  sample_category: z.enum(['Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other']),
  sample_type: z.enum(['Agar Plate', 'Broth']),
  incubation_date: z.string().min(1, 'Date is required'),
  incubation_temp_c: z.preprocess((val) => Number(val), z.number().min(0).max(100)),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().optional(),
  od_value: z.preprocess((val) => val === '' ? undefined : Number(val), z.number().min(0).max(10).optional()),
  ph_value: z.preprocess((val) => val === '' ? undefined : Number(val), z.number().min(0).max(14).optional()),
  colony_count: z.preprocess((val) => val === '' ? undefined : Number(val), z.number().int().min(0).optional()),
  cfu_per_ml: z.preprocess((val) => val === '' ? undefined : Number(val), z.number().min(0).optional()),
  staining_method: z.string().optional(),
  microscopic_morphology: z.string().optional(),
  colony_morphology: z.string().optional(),
  sterility_status: z.enum(['Pending', 'Sterile', 'Contaminated']).default('Pending'),
  observation: z.string().optional()
});

export default function IncubationFormModal({ onClose, onSuccess, initialData = null }) {
  const [batches, setBatches] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        ...initialData,
        incubation_date: initialData.incubation_date || new Date().toISOString().split('T')[0],
        start_time: initialData.start_time ? new Date(initialData.start_time).toISOString().slice(0, 16) : '',
        end_time: initialData.end_time ? new Date(initialData.end_time).toISOString().slice(0, 16) : ''
    } : {
        incubation_date: new Date().toISOString().split('T')[0],
        sample_category: 'Fermentation IPC',
        sample_type: 'Agar Plate',
        sterility_status: 'Pending',
        batch_id: '',
        incubation_temp_c: 37,
        start_time: new Date().toISOString().slice(0, 16),
        od_value: '',
        ph_value: ''
    }
  });

  const category = watch('sample_category');
  const type = watch('sample_type');

  useEffect(() => {
    async function fetchBatches() {
      const { data } = await supabase.from('batches').select('id, batch_id').order('created_at', { ascending: false }).limit(20);
      if (data) setBatches(data);
    }
    fetchBatches();
  }, [supabase]);

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        batch_id: data.sample_category === 'Fermentation IPC' ? data.batch_id || null : null,
        flask_id: initialData?.flask_id || null,
        qc_sample_id: initialData?.qc_sample_id || null,
        source_stage: initialData?.source_stage || null,
        source_type: initialData?.source_type || null,
        sampled_at: initialData?.sampled_at ? new Date(initialData.sampled_at).toISOString() : null,
        start_time: new Date(data.start_time).toISOString(),
        end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
        od_value: data.od_value ?? null,
        ph_value: data.ph_value ?? null,
        colony_count: data.colony_count ?? null,
        cfu_per_ml: data.cfu_per_ml ?? null,
      };

      let url = '/api/research/incubation';
      let method = 'POST';

      if (initialData?.id) {
        payload.id = initialData.id;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to save');
      onSuccess();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in duration-200">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-100 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900">{initialData ? 'Edit Incubation Record' : 'Log New Sample'}</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Sample Name *</label>
              <input {...register('sample_name')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. F2 Plate A" />
              {errors.sample_name && <p className="text-red-500 text-[10px] mt-1">{errors.sample_name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Category *</label>
              <select {...register('sample_category')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none">
                <option value="Fermentation IPC">Fermentation IPC</option>
                <option value="Cell Bank">Cell Bank</option>
                <option value="Passage">Passage</option>
                <option value="Subculture">Subculture</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {category === 'Fermentation IPC' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Link to Batch (Optional)</label>
                <select {...register('batch_id')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none">
                  <option value="">-- No Batch --</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.batch_id}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Sample Type *</label>
              <select {...register('sample_type')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none">
                <option value="Agar Plate">Agar Plate</option>
                <option value="Broth">Broth</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Incubation Date *</label>
              <input type="date" {...register('incubation_date')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Temp (C) *</label>
              <input type="number" step="0.1" {...register('incubation_temp_c')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Start Time *</label>
              <input type="datetime-local" {...register('start_time')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-bold text-navy mb-4">Measurements & Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">OD Value</label>
                <input type="number" step="0.001" {...register('od_value')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. 0.500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">pH Value</label>
                <input type="number" step="0.01" {...register('ph_value')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. 4.2" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Staining Method</label>
                <input {...register('staining_method')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. Gram Stain" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Microscopic Morphology</label>
                <input {...register('microscopic_morphology')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. Gram Positive Rods" />
              </div>
              {type === 'Agar Plate' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Colony Count (per plate)</label>
                    <input type="number" min="0" {...register('colony_count')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. 245" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">CFU/ml (calculated)</label>
                    <input type="number" step="any" {...register('cfu_per_ml')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" placeholder="e.g. 2.45e8" />
                  </div>
                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Colony Morphology Details</label>
                    <textarea {...register('colony_morphology')} rows={2} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none resize-none" placeholder="Describe colonies..."></textarea>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 bg-gray-50 -mx-6 px-6 pb-6">
            <h3 className="text-sm font-bold text-navy mt-4 mb-4">Results (Can update later)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Sterility Status</label>
                <select {...register('sterility_status')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none">
                  <option value="Pending">Pending</option>
                  <option value="Sterile">Sterile</option>
                  <option value="Contaminated">Contaminated</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">End Time</label>
                <input type="datetime-local" {...register('end_time')} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none" />
              </div>
              <div className="col-span-full">
                <label className="block text-xs font-bold text-gray-700 mb-1">Final Observation</label>
                <textarea {...register('observation')} rows={2} className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-navy outline-none resize-none" placeholder="Final conclusions..."></textarea>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-100 py-4 flex justify-end gap-3 z-10">
             <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors">Cancel</button>
             <button type="submit" disabled={submitting} className="flex items-center px-6 py-2 bg-navy text-white font-bold rounded-lg hover:bg-navy/90 text-sm transition-colors disabled:opacity-70">
               {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
               Save Record
             </button>
          </div>
        </form>
      </div>
    </div>
  );
}
