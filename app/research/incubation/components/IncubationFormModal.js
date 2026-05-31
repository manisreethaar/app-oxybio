'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  X, Save, Loader2, Plus, Trash2, Clock,
  CheckCircle2, AlertCircle, FlaskConical,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const formSchema = z.object({
  sample_name: z.string().min(1, 'Sample name is required'),
  batch_id: z.string().optional(),
  sample_category: z.enum(['Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other']),
  sample_type: z.enum(['Agar Plate', 'Broth']),
  incubation_date: z.string().min(1, 'Date is required'),
  incubation_temp_c: z.preprocess((v) => Number(v), z.number().min(0).max(100)),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().optional(),
  od_value: z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).max(10).optional()),
  ph_value: z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).max(14).optional()),
  colony_count: z.preprocess((v) => v === '' ? undefined : Number(v), z.number().int().min(0).optional()),
  cfu_per_ml: z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).optional()),
  staining_method: z.string().optional(),
  microscopic_morphology: z.string().optional(),
  colony_morphology: z.string().optional(),
  sterility_status: z.enum(['Pending', 'Sterile', 'Contaminated']).default('Pending'),
});

const READ_STATUSES = [
  { value: 'no_growth',   label: 'No Growth',    cls: 'border-gray-300 bg-gray-100 text-gray-700' },
  { value: 'growing',     label: 'Growing',       cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'contaminated',label: 'Contaminated',  cls: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'tntc',        label: 'TNTC',          cls: 'border-amber-300 bg-amber-50 text-amber-700' },
];

const PRESET_HOURS = [12, 24, 36, 48];

function parseObservation(obs) {
  if (!obs) return { reads: [], notes: '' };
  try {
    const p = JSON.parse(obs);
    if (p && Array.isArray(p.reads)) return { reads: p.reads, notes: p.notes || '' };
  } catch {}
  return { reads: [], notes: obs };
}

const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:border-navy focus:ring-2 focus:ring-navy/10 outline-none transition bg-white';
const labelCls = 'block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5';

export default function IncubationFormModal({ onClose, onSuccess, initialData = null }) {
  const [batches, setBatches] = useState(() =>
    initialData?.batches && initialData?.batch_id
      ? [{ id: initialData.batch_id, batch_id: initialData.batches.batch_id }]
      : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('setup');
  const [customHour, setCustomHour] = useState('');
  const supabase = useMemo(() => createClient(), []);

  const { reads: initReads, notes: initNotes } = parseObservation(initialData?.observation);
  const [plateReads, setPlateReads] = useState(initReads);
  const [finalNote, setFinalNote] = useState(initNotes);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      ...initialData,
      incubation_date: initialData.incubation_date || new Date().toISOString().split('T')[0],
      start_time: initialData.start_time ? new Date(initialData.start_time).toISOString().slice(0, 16) : '',
      end_time:   initialData.end_time   ? new Date(initialData.end_time).toISOString().slice(0, 16)   : '',
    } : {
      incubation_date:   new Date().toISOString().split('T')[0],
      sample_category:   'Fermentation IPC',
      sample_type:       'Agar Plate',
      sterility_status:  'Pending',
      batch_id:          '',
      incubation_temp_c: 37,
      start_time:        new Date().toISOString().slice(0, 16),
      od_value:          '',
      ph_value:          '',
    },
  });

  const category   = watch('sample_category');
  const sampleType = watch('sample_type');
  const sterility  = watch('sterility_status');

  useEffect(() => {
    supabase.from('batches').select('id, batch_id').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        if (!data) return;
        setBatches(prev => {
          const ids = new Set(data.map(d => d.id));
          return [...prev.filter(p => !ids.has(p.id)), ...data];
        });
      });
  }, [supabase]);

  const addRead = (h) => {
    const hour = Number(h);
    if (!hour || plateReads.some(r => r.hour === hour)) return;
    setPlateReads(prev =>
      [...prev, { hour, status: 'no_growth', colony_count: '', notes: '' }]
        .sort((a, b) => a.hour - b.hour)
    );
    setCustomHour('');
  };

  const updateRead = (hour, field, value) =>
    setPlateReads(prev => prev.map(r => r.hour === hour ? { ...r, [field]: value } : r));

  const removeRead = (hour) =>
    setPlateReads(prev => prev.filter(r => r.hour !== hour));

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const readsPayload = plateReads.map(r => ({
        ...r,
        colony_count: r.colony_count !== '' ? Number(r.colony_count) : null,
      }));
      const observation = readsPayload.length > 0
        ? JSON.stringify({ reads: readsPayload, notes: finalNote || '' })
        : (finalNote || null);

      const payload = {
        ...data,
        batch_id:               data.sample_category === 'Fermentation IPC' ? data.batch_id || null : null,
        flask_id:               initialData?.flask_id || null,
        qc_sample_id:           initialData?.qc_sample_id || null,
        fermentation_reading_id:initialData?.fermentation_reading_id || null,
        source_stage:           initialData?.source_stage || null,
        source_type:            initialData?.source_type || null,
        sampled_at:             initialData?.sampled_at ? new Date(initialData.sampled_at).toISOString() : null,
        start_time:             new Date(data.start_time).toISOString(),
        end_time:               data.end_time ? new Date(data.end_time).toISOString() : null,
        od_value:               data.od_value ?? null,
        ph_value:               data.ph_value ?? null,
        colony_count:           data.colony_count ?? null,
        cfu_per_ml:             data.cfu_per_ml ?? null,
        observation,
      };

      if (initialData?.id) { payload.id = initialData.id; }

      const res = await fetch('/api/research/incubation', {
        method:  initialData?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
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

  const tabs = [
    { id: 'setup',   label: 'Setup' },
    { id: 'reads',   label: plateReads.length ? `Plate Reads (${plateReads.length})` : 'Plate Reads' },
    { id: 'results', label: 'Results' },
  ];

  return (
   <div className="fixed inset-0 z-[1200] flex items-center justify-end bg-slate-900/60 backdrop-blur-sm p-0">
<div className="h-[100dvh] sm:h-screen bg-white shadow-2xl w-full sm:max-w-lg flex flex-col sm:animate-slide-left"> 

        {/* Header */}
       <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
         <div className="flex items-center gap-3">
           <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center shrink-0">
              <FlaskConical className="w-4.5 h-4.5 text-navy" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900">
                {initialData ? 'Edit Incubation Record' : 'Log New Sample'}
              </h2>
              {initialData?.sample_name && (
                <p className="text-[10px] font-mono text-gray-400 mt-0.5">{initialData.sample_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Strip */}
       <div className="flex border-b border-gray-100 px-5 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`py-2.5 px-3 text-xs font-black border-b-2 transition-colors mr-1 whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
         <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* ── Tab: Setup ── */}
            {activeTab === 'setup' && (
              <>
               <div className="space-y-3">
                  <p className={labelCls}>Sample Identity</p>

                  <div>
                    <label className={labelCls}>Sample Name *</label>
                    <input {...register('sample_name')} className={inputCls} placeholder="e.g. F2 Plate A" />
                    {errors.sample_name && <p className="text-red-500 text-[10px] mt-1">{errors.sample_name.message}</p>}
                  </div>

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Category *</label>
                      <select {...register('sample_category')} className={inputCls}>
                        <option value="Fermentation IPC">Fermentation IPC</option>
                        <option value="Cell Bank">Cell Bank</option>
                        <option value="Passage">Passage</option>
                        <option value="Subculture">Subculture</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Sample Type *</label>
                      <select {...register('sample_type')} className={inputCls}>
                        <option value="Agar Plate">Agar Plate</option>
                        <option value="Broth">Broth</option>
                      </select>
                    </div>
                  </div>

                  {category === 'Fermentation IPC' && (
                    <div>
                      <label className={labelCls}>Link to Batch</label>
                      <select {...register('batch_id')} className={inputCls}>
                        <option value="">— No Batch —</option>
                        {batches.map(b => <option key={b.id} value={b.id}>{b.batch_id}</option>)}
                      </select>
                    </div>
                  )}
                </div>

               <div className="space-y-3 pt-3 border-t border-gray-100">
                  <p className={labelCls}>Incubation Setup</p>

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Date *</label>
                      <input type="date" {...register('incubation_date')} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Temp (°C) *</label>
                      <input type="number" step="0.1" {...register('incubation_temp_c')} className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Start Time *</label>
                    <input type="datetime-local" {...register('start_time')} className={inputCls} />
                    {errors.start_time && <p className="text-red-500 text-[10px] mt-1">{errors.start_time.message}</p>}
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Plate Reads ── */}
            {activeTab === 'reads' && (
             <div className="space-y-4">
                {/* Quick add presets */}
                <div>
                  <p className={labelCls}>Add Read at Hour</p>
                 <div className="flex flex-wrap gap-2">
                    {PRESET_HOURS.map(h => {
                      const exists = plateReads.some(r => r.hour === h);
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => addRead(h)}
                          disabled={exists}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
                            exists
                              ? 'bg-navy/10 text-navy border-navy/30 cursor-default'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-navy hover:text-navy hover:bg-navy/5'
                          }`}
                        >
                          {exists ? '✓' : '+'}{h}h
                        </button>
                      );
                    })}
                    {/* Custom hour */}
                   <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={customHour}
                        onChange={e => setCustomHour(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRead(customHour))}
                        placeholder="hr"
                        className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-navy text-center"
                      />
                      <button
                        type="button"
                        onClick={() => addRead(customHour)}
                        disabled={!customHour}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-gray-100 hover:bg-gray-200 text-gray-600 transition disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Read cards */}
                {plateReads.length === 0 ? (
                 <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-2xl">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    <p className="text-xs font-bold text-gray-400">No plate reads logged yet.</p>
                    <p className="text-[10px] text-gray-300 mt-1">Use the buttons above to add reads at 12h, 24h, 36h or 48h.</p>
                  </div>
                ) : (
                 <div className="space-y-3">
                    {plateReads.map(read => (
                      <div key={read.hour} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/40">
                       <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-navy font-mono">T+{read.hour}h Read</span>
                          <button
                            type="button"
                            onClick={() => removeRead(read.hour)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Status chips */}
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">Plate Status</p>
                         <div className="flex flex-wrap gap-1.5">
                            {READ_STATUSES.map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => updateRead(read.hour, 'status', opt.value)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all ${
                                  read.status === opt.value
                                    ? `${opt.cls} shadow-sm`
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                       <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">Colony Count</label>
                            <input
                              type="number"
                              min="0"
                              value={read.colony_count}
                              onChange={e => updateRead(read.hour, 'colony_count', e.target.value)}
                              placeholder="e.g. 50"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">Notes</label>
                            <input
                              type="text"
                              value={read.notes}
                              onChange={e => updateRead(read.hour, 'notes', e.target.value)}
                              placeholder="Observations…"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Final note */}
               <div className="pt-3 border-t border-gray-100">
                  <label className={labelCls}>Final Note / Overall Conclusion</label>
                  <textarea
                    value={finalNote}
                    onChange={e => setFinalNote(e.target.value)}
                    rows={2}
                    placeholder="e.g. Clean growth at 48h, no contamination observed."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-navy transition resize-none bg-white"
                  />
                </div>
              </div>
            )}

            {/* ── Tab: Results ── */}
            {activeTab === 'results' && (
             <div className="space-y-4">
                {/* Sterility status — big buttons */}
                <div>
                  <p className={labelCls}>Sterility Status</p>
                 <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'Pending',      icon: <Clock className="w-4 h-4" />,         cls: 'border-amber-200 bg-amber-50 text-amber-700' },
                      { value: 'Sterile',      icon: <CheckCircle2 className="w-4 h-4" />,  cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
                      { value: 'Contaminated', icon: <AlertCircle className="w-4 h-4" />,   cls: 'border-red-200 bg-red-50 text-red-700' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValue('sterility_status', opt.value, { shouldValidate: true })}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-[10px] font-black ${
                          sterility === opt.value
                            ? opt.cls
                            : 'border-gray-100 text-gray-300 hover:border-gray-200 hover:text-gray-500 bg-white'
                        }`}
                      >
                        {opt.icon}
                        {opt.value}
                      </button>
                    ))}
                  </div>
                </div>

                {/* End Time */}
                <div>
                  <label className={labelCls}>End Time</label>
                  <input type="datetime-local" {...register('end_time')} className={inputCls} />
                </div>

                {/* Counts */}
               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Colony Count</label>
                    <input type="number" min="0" {...register('colony_count')} placeholder="e.g. 245" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>CFU / mL</label>
                    <input type="number" step="any" {...register('cfu_per_ml')} placeholder="e.g. 2.45e8" className={inputCls} />
                  </div>
                </div>

                {/* OD / pH for broth */}
               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>OD Value</label>
                    <input type="number" step="0.001" {...register('od_value')} placeholder="0.500" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>pH Value</label>
                    <input type="number" step="0.01" {...register('ph_value')} placeholder="4.2" className={inputCls} />
                  </div>
                </div>

                {/* Colony Morphology */}
                {sampleType === 'Agar Plate' && (
                  <div>
                    <label className={labelCls}>Colony Morphology</label>
                    <textarea
                      {...register('colony_morphology')}
                      rows={2}
                      placeholder="Describe colonies…"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-navy transition resize-none bg-white"
                    />
                  </div>
                )}

                {/* Staining */}
               <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                  <div>
                    <label className={labelCls}>Staining Method</label>
                    <input {...register('staining_method')} placeholder="e.g. Gram Stain" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Microscopy</label>
                    <input {...register('microscopic_morphology')} placeholder="e.g. Gram +ve Rods" className={inputCls} />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Sticky Footer */}
         <div className="shrink-0 border-t border-gray-100 px-5 py-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 font-bold text-gray-600 hover:bg-gray-100 rounded-xl text-sm transition-colors border border-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-navy text-white font-bold rounded-xl hover:bg-navy/90 text-sm transition-colors disabled:opacity-70"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
