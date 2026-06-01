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
import { useAuth } from '@/context/AuthContext';

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
  dilution_factor: z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).optional()),
  volume_plated_ml: z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).optional()),
  replicate_label: z.string().optional(),
  media_used: z.string().optional(),
  media_lot: z.string().optional(),
  // G-72: plate image; G-73: duplicate flag
  plate_image_url: z.string().optional(),
  is_duplicate: z.boolean().optional().default(false),
});

const READ_STATUSES = [
  { value: 'no_growth',    label: 'No Growth',    cls: 'border-gray-300 bg-gray-100 text-gray-700' },
  { value: 'growing',      label: 'Growing',       cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'contaminated', label: 'Contaminated',  cls: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'tntc',         label: 'TNTC',          cls: 'border-amber-300 bg-amber-50 text-amber-700' },
];

const PRESET_HOURS = [12, 24, 36, 48];

// Colony morphology options
const MORPHOLOGY_OPTIONS = {
  shape:     { label: 'Shape',     choices: ['Circular', 'Irregular', 'Rhizoid', 'Punctiform'] },
  margin:    { label: 'Margin',    choices: ['Entire', 'Undulate', 'Lobate', 'Serrate'] },
  elevation: { label: 'Elevation', choices: ['Flat', 'Raised', 'Convex', 'Umbonate'] },
  color:     { label: 'Color',     choices: ['White', 'Cream', 'Yellow', 'Orange', 'Pink', 'Brown', 'Black'] },
  surface:   { label: 'Surface',   choices: ['Smooth', 'Rough', 'Wrinkled', 'Mucoid'] },
};

const CHIP_COLORS = {
  shape:     'bg-blue-50 text-blue-700 border-blue-200',
  margin:    'bg-purple-50 text-purple-700 border-purple-200',
  elevation: 'bg-teal-50 text-teal-700 border-teal-200',
  color:     'bg-orange-50 text-orange-700 border-orange-200',
  surface:   'bg-pink-50 text-pink-700 border-pink-200',
};

function parseMorphology(raw) {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && !Array.isArray(p)) return p;
  } catch {}
  return {};
}

function MorphologyPicker({ value, onChange }) {
  const selected = parseMorphology(value);

  const toggle = (trait, choice) => {
    const next = { ...selected };
    if (next[trait] === choice) {
      delete next[trait];
    } else {
      next[trait] = choice;
    }
    onChange(Object.keys(next).length > 0 ? JSON.stringify(next) : '');
  };

  return (
    <div className="space-y-3">
      {Object.entries(MORPHOLOGY_OPTIONS).map(([trait, { label, choices }]) => (
        <div key={trait}>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">{label}</p>
          <div className="flex flex-wrap gap-1.5">
            {choices.map(choice => {
              const isSelected = selected[trait] === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => toggle(trait, choice)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all ${
                    isSelected
                      ? CHIP_COLORS[trait]
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                  }`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {/* Display selected chips summary */}
      {Object.keys(selected).length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Selected</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(selected).map(([trait, choice]) => (
              <span key={trait} className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${CHIP_COLORS[trait]}`}>
                {MORPHOLOGY_OPTIONS[trait].label}: {choice}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MorphologyChips({ raw }) {
  const parsed = parseMorphology(raw);
  if (Object.keys(parsed).length === 0) {
    return <span className="text-sm text-gray-500">{raw || '--'}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(parsed).map(([trait, choice]) => (
        <span key={trait} className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${CHIP_COLORS[trait] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
          {MORPHOLOGY_OPTIONS[trait]?.label || trait}: {choice}
        </span>
      ))}
    </div>
  );
}

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
  const { employeeProfile } = useAuth();
  const [batches, setBatches] = useState(() =>
    initialData?.batches && initialData?.batch_id
      ? [{ id: initialData.batch_id, batch_id: initialData.batches.batch_id }]
      : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('setup');
  const [customHour, setCustomHour] = useState('');
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaStocks, setMediaStocks] = useState([]);
  const [selectedMediaItemId, setSelectedMediaItemId] = useState(initialData?.media_inventory_item_id || '');
  const [selectedStockId, setSelectedStockId] = useState('');
  const [mediaVolumeUsed, setMediaVolumeUsed] = useState(initialData?.media_volume_used_ml ?? '');
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
      dilution_factor:  initialData.dilution_factor  ?? '',
      volume_plated_ml: initialData.volume_plated_ml ?? '',
      replicate_label:  initialData.replicate_label  || 'None',
      media_lot:        initialData.media_lot        || '',
      plate_image_url:  initialData.plate_image_url  || '',
      is_duplicate:     initialData.is_duplicate     || false,
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
      dilution_factor:   '',
      volume_plated_ml:  '',
      replicate_label:   'None',
      media_lot:         '',
      plate_image_url:   '',
      is_duplicate:      false,
    },
  });

  const category       = watch('sample_category');
  const sampleType     = watch('sample_type');
  const sterility      = watch('sterility_status');
  const colonyCount    = watch('colony_count');
  const dilutionFactor = watch('dilution_factor');
  const volPlated      = watch('volume_plated_ml');
  const colonyMorph    = watch('colony_morphology');

  // Auto-calculate CFU/mL when inputs are available
  const autoCfu = useMemo(() => {
    const cc  = Number(colonyCount);
    const df  = Number(dilutionFactor);
    const vol = Number(volPlated);
    if (cc > 0 && df > 0 && vol > 0) {
      return cc / (df * vol);
    }
    return null;
  }, [colonyCount, dilutionFactor, volPlated]);

  useEffect(() => {
    if (autoCfu !== null) {
      setValue('cfu_per_ml', autoCfu);
    }
  }, [autoCfu, setValue]);

  // CFU preview for dilution series (live update from plateReads)
  const cfuPreview = useMemo(() => {
    const df  = Number(dilutionFactor);
    const vol = Number(volPlated);
    if (df > 0 && vol > 0) {
      const latestRead = [...plateReads].reverse().find(r => r.colony_count !== '' && r.colony_count != null);
      const count = latestRead ? Number(latestRead.colony_count) : (Number(colonyCount) || null);
      if (count !== null && count > 0) {
        return count / (df * vol);
      }
    }
    return null;
  }, [dilutionFactor, volPlated, plateReads, colonyCount]);

  useEffect(() => {
    supabase.from('batches').select('id, batch_id').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        if (!data) return;
        setBatches(prev => {
          const ids = new Set(data.map(d => d.id));
          return [...prev.filter(p => !ids.has(p.id)), ...data];
        });
      });
    supabase.from('inventory_items').select('id, name, unit').eq('category', 'Media')
      .order('name').then(({ data }) => setMediaItems(data || []));
  }, [supabase]);

  useEffect(() => {
    if (!selectedMediaItemId) { setMediaStocks([]); return; }
    supabase.from('inventory_stock')
      .select('id, supplier_batch_number, current_quantity, expiry_date, location')
      .eq('item_id', selectedMediaItemId)
      .eq('status', 'Available')
      .gt('current_quantity', 0)
      .order('expiry_date', { ascending: true })
      .then(({ data }) => setMediaStocks(data || []));
  }, [selectedMediaItemId, supabase]);

  const addRead = (h) => {
    const hour = Number(h);
    if (!hour || plateReads.some(r => r.hour === hour)) return;
    setPlateReads(prev =>
      [...prev, { hour, status: 'no_growth', colony_count: '', notes: '', recorded_by: employeeProfile?.full_name || 'Unknown' }]
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
        media_inventory_item_id: selectedMediaItemId || null,
        media_volume_used_ml:   mediaVolumeUsed !== '' ? Number(mediaVolumeUsed) : null,
        _stock_id:              selectedStockId || null,
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
        dilution_factor:        data.dilution_factor ?? null,
        volume_plated_ml:       data.volume_plated_ml ?? null,
        replicate_label:        data.replicate_label === 'None' ? null : (data.replicate_label || null),
        media_lot:              data.media_lot || null,
        plate_image_url:        data.plate_image_url || null,
        is_duplicate:           data.is_duplicate || false,
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
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col overflow-hidden">

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

            {/* Tab: Setup */}
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
                        <option value="">-- No Batch --</option>
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
                      <label className={labelCls}>Temp (deg C) *</label>
                      <input type="number" step="0.1" {...register('incubation_temp_c')} className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Start Time *</label>
                    <input type="datetime-local" {...register('start_time')} className={inputCls} />
                    {errors.start_time && <p className="text-red-500 text-[10px] mt-1">{errors.start_time.message}</p>}
                  </div>

                  {/* Media Used + Media Lot */}
                  <div>
                    <label className={labelCls}>Media Used</label>
                    <input {...register('media_used')} className={inputCls} placeholder="e.g. TSA, LB Agar" />
                  </div>
                  <div>
                    <label className={labelCls}>Media Lot / Batch No</label>
                    <input {...register('media_lot')} className={inputCls} placeholder="e.g. LOT-2024-0053" />
                  </div>

                  {/* Inventory deduction */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Deduct from Inventory</p>
                    <div>
                      <label className={labelCls}>Media Item (Inventory)</label>
                      <select
                        value={selectedMediaItemId}
                        onChange={e => { setSelectedMediaItemId(e.target.value); setSelectedStockId(''); }}
                        className={inputCls}
                      >
                        <option value="">-- Skip / not in inventory --</option>
                        {mediaItems.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                    </div>
                    {selectedMediaItemId && (
                      <>
                        <div>
                          <label className={labelCls}>Stock Lot</label>
                          <select
                            value={selectedStockId}
                            onChange={e => setSelectedStockId(e.target.value)}
                            className={inputCls}
                          >
                            <option value="">-- Select lot --</option>
                            {mediaStocks.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.supplier_batch_number || 'No lot'} — {s.current_quantity} avail
                                {s.expiry_date ? ` · exp ${s.expiry_date}` : ''}
                                {s.location ? ` · ${s.location}` : ''}
                              </option>
                            ))}
                          </select>
                          {mediaStocks.length === 0 && (
                            <p className="text-[9px] text-red-500 mt-1">No available stock for this item.</p>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>Volume / Weight Used</label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={mediaVolumeUsed}
                            onChange={e => setMediaVolumeUsed(e.target.value)}
                            placeholder="e.g. 25"
                            className={inputCls}
                          />
                          <p className="text-[9px] text-gray-400 mt-1">
                            {mediaItems.find(m => m.id === selectedMediaItemId)?.unit || 'units'} — will be deducted from selected lot on save
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Dilution Series section - Agar Plate only */}
                {sampleType === 'Agar Plate' && (
                  <div className="space-y-3 pt-3 border-t border-gray-100">
                    <p className={labelCls}>Dilution Series</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Dilution Factor</label>
                        <input
                          type="number"
                          step="any"
                          {...register('dilution_factor')}
                          placeholder="e.g. 0.001"
                          className={inputCls}
                        />
                        <p className="text-[9px] text-gray-400 mt-1">0.001 = 10^-3</p>
                      </div>
                      <div>
                        <label className={labelCls}>Volume Plated (mL)</label>
                        <input
                          type="number"
                          step="any"
                          {...register('volume_plated_ml')}
                          placeholder="e.g. 0.1"
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Replicate</label>
                      <select {...register('replicate_label')} className={inputCls}>
                        <option value="None">None</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                      </select>
                    </div>

                    {/* G-72: Plate image URL */}
                    <div>
                      <label className={labelCls}>Plate Photo URL <span className="text-gray-400 font-normal normal-case">(G-72 — optional)</span></label>
                      <input type="url" {...register('plate_image_url')} className={inputCls} placeholder="https://... (link to plate photo)"/>
                    </div>
                    {/* G-73: Duplicate flag */}
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="is_dup" {...register('is_duplicate')} className="w-4 h-4 rounded border-gray-300"/>
                      <label htmlFor="is_dup" className="text-xs font-bold text-gray-700">Mark as Duplicate Plate (triplicate / QC check)</label>
                    </div>

                    {/* CFU/mL preview */}
                    {cfuPreview !== null && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">
                          CFU/mL Preview
                        </p>
                        <p className="text-sm font-black text-amber-800 font-mono">
                          {cfuPreview.toExponential(2)} CFU/mL
                        </p>
                        <p className="text-[9px] text-amber-600 mt-1">
                          = colony_count / (dilution_factor x volume_plated_ml)
                        </p>
                      </div>
                    )}

                    {/* Show formula hint even when no values yet */}
                    {cfuPreview === null && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">
                          CFU/mL Formula
                        </p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          CFU/mL = colony_count / (dilution_factor x volume_plated_ml)
                        </p>
                        <p className="text-[9px] text-gray-400 mt-1">
                          Fill in dilution factor, volume, and colony count to see the preview.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Tab: Plate Reads */}
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
                          {exists ? '+' : '+'}{h}h
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

                {/* CFU preview in reads tab */}
                {cfuPreview !== null && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">
                      Auto-calculated CFU/mL
                    </p>
                    <p className="text-sm font-black text-amber-800 font-mono">
                      {cfuPreview.toExponential(2)} CFU/mL
                    </p>
                    <p className="text-[9px] text-amber-500 mt-0.5">
                      Based on latest colony count in reads + dilution settings from Setup tab.
                    </p>
                  </div>
                )}

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
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-navy font-mono">T+{read.hour}h Read</span>
                            {read.recorded_by && (
                              <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                Logged by: {read.recorded_by}
                              </span>
                            )}
                          </div>
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
                              placeholder="Observations..."
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

            {/* Tab: Results */}
            {activeTab === 'results' && (
              <div className="space-y-4">
                {/* Sterility status - big buttons */}
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
                    <label className={labelCls}>Colony Count <span className="text-gray-400 font-normal normal-case text-[8px]">(G-89: manual count — use colony counter tool and enter result)</span></label>
                    <input type="number" min="0" {...register('colony_count')} placeholder="e.g. 245" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>CFU / mL</label>
                    <input type="number" step="any" {...register('cfu_per_ml')} placeholder="e.g. 2.45e8" className={inputCls} />
                  </div>
                </div>

                {/* Auto CFU info box */}
                {autoCfu !== null && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">
                      Auto-calculated
                    </p>
                    <p className="text-sm font-black text-amber-800 font-mono">
                      {autoCfu.toExponential(2)} CFU/mL
                    </p>
                    <p className="text-[9px] text-amber-500 mt-0.5">
                      Auto-filled from colony count, dilution factor, and volume plated.
                    </p>
                  </div>
                )}

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

                {/* Colony Morphology - structured picker for Agar Plate */}
                {sampleType === 'Agar Plate' && (
                  <div>
                    <label className={labelCls}>Colony Morphology</label>
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40">
                      <MorphologyPicker
                        value={colonyMorph}
                        onChange={(val) => setValue('colony_morphology', val)}
                      />
                    </div>
                    {colonyMorph && (
                      <div className="mt-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Stored as JSON</p>
                        <p className="text-[9px] font-mono text-gray-400 break-all">{colonyMorph}</p>
                      </div>
                    )}
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
          <div className="shrink-0 border-t border-gray-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3">
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
