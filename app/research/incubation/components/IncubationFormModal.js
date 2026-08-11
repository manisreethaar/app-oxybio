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
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';

// null-safe string: DB returns null for empty fields, z.string().optional() rejects null
const nullStr = z.preprocess((v) => v ?? '', z.string());
const nullStrOpt = z.preprocess((v) => v == null ? undefined : String(v), z.string().optional());

const formSchema = z.object({
  sample_name: z.string().min(1, 'Sample name is required'),
  batch_id: nullStrOpt,
  sample_category: z.enum(['Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other']),
  sample_type: z.enum(['Agar Plate', 'Broth']),
  incubation_date: z.string().min(1, 'Date is required'),
  incubation_temp_c: z.preprocess((v) => Number(v), z.number().min(0).max(100)),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: nullStrOpt,
  od_value: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().min(0).max(10).optional()),
  ph_value: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().min(0).max(14).optional()),
  colony_count: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().int().min(0).optional()),
  cfu_per_ml: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().min(0).optional()),
  staining_method: nullStrOpt,
  microscopic_morphology: nullStrOpt,
  colony_morphology: nullStrOpt,
  sterility_status: z.preprocess((v) => v ?? 'Pending', z.enum(['Pending', 'Sterile', 'Contaminated'])).default('Pending'),
  dilution_factor: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().min(0).optional()),
  volume_plated_ml: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().min(0).optional()),
  replicate_label: nullStrOpt,
  media_used: nullStrOpt,
  media_lot: nullStrOpt,
  plate_image_url: nullStrOpt,
  is_duplicate: z.preprocess((v) => v ?? false, z.boolean()).default(false),
  formulation_id: nullStrOpt,
  media_inventory_item_id: nullStrOpt,
  media_volume_used_ml: z.preprocess((v) => (v === '' || v == null) ? undefined : Number(v), z.number().min(0).optional()),
});

const READ_STATUSES = [
  { value: 'no_growth',    label: 'No Growth',    cls: 'border-slate-300 bg-slate-100 text-slate-700' },
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
  shape:     'bg-slate-50 text-slate-700 border-slate-200',
  margin:    'bg-slate-50 text-slate-700 border-slate-200',
  elevation: 'bg-slate-50 text-slate-700 border-slate-200',
  color:     'bg-amber-50 text-amber-700 border-amber-200',
  surface:   'bg-red-50 text-red-700 border-red-200',
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
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>
          <div className="flex flex-wrap gap-1.5">
            {choices.map(choice => {
              const isSelected = selected[trait] === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => toggle(trait, choice)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                    isSelected
                      ? CHIP_COLORS[trait]
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
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
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Selected</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(selected).map(([trait, choice]) => (
              <span key={trait} className={`px-2.5 py-1 rounded-lg text-xs font-black border ${CHIP_COLORS[trait]}`}>
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
    return <span className="text-sm text-slate-500">{raw || '--'}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(parsed).map(([trait, choice]) => (
        <span key={trait} className={`px-2.5 py-1 rounded-lg text-xs font-black border ${CHIP_COLORS[trait] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
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

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:border-navy focus:ring-2 focus:ring-navy/10 outline-none transition bg-white';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

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
  const [mediaVolumeUsed, setMediaVolumeUsed] = useState(initialData?.media_volume_used_ml ?? '');
  const [mediaRecipes, setMediaRecipes] = useState([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState(initialData?.formulation_id || '');
  const [selectedMediaItemId, setSelectedMediaItemId] = useState(initialData?.media_inventory_item_id || '');
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
    withTimeout(supabase.from('batches').select('id, batch_id').order('created_at', { ascending: false }).limit(20), 45000, 'Batches dropdown load timed out')
      .then(({ data }) => {
        if (!data) return;
        setBatches(prev => {
          const ids = new Set(data.map(d => d.id));
          return [...prev.filter(p => !ids.has(p.id)), ...data];
        });
      })
      .catch(err => console.error('Batches dropdown fetch error:', err));
    withTimeout(supabase.from('inventory_items').select('id, name, unit').in('category', ['Microbiological Media', 'Lab Consumables'])
      .order('name'), 45000, 'Media items load timed out')
      .then(({ data }) => setMediaItems(data || []))
      .catch(err => console.error('Media items fetch error:', err));
    withTimeout(supabase.from('formulations').select('id, code, name, version, ingredients, category')
      .eq('status', 'Approved')
      .order('name'), 45000, 'Media recipes load timed out')
      .then(({ data }) => setMediaRecipes(data || []))
      .catch(err => console.error('Media recipes fetch error:', err));
  }, [supabase]);


  const addRead = (h) => {
    const hour = Number(h);
    if (!hour || plateReads.some(r => r.hour === hour)) return;
    setPlateReads(prev =>
      [...prev, { hour, status: 'no_growth', colony_count: '', od_value: '', ph_value: '', notes: '', recorded_by: employeeProfile?.full_name || 'Unknown' }]
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
        colony_count: r.colony_count !== '' && r.colony_count != null ? Number(r.colony_count) : null,
        od_value: r.od_value !== '' && r.od_value != null ? Number(r.od_value) : null,
        ph_value: r.ph_value !== '' && r.ph_value != null ? Number(r.ph_value) : null,
      }));
      const observation = readsPayload.length > 0
        ? JSON.stringify({ reads: readsPayload, notes: finalNote || '' })
        : (finalNote || null);

      const payload = {
        ...data,
        batch_id:               data.sample_category === 'Fermentation IPC' ? data.batch_id || null : null,
        media_inventory_item_id: selectedMediaItemId || null,
        media_volume_used_ml:   mediaVolumeUsed !== '' ? Number(mediaVolumeUsed) : null,
        formulation_id:         selectedRecipeId || null,
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
    <div className="fixed inset-0 z-[1200] flex items-start sm:items-center justify-center bg-slate-50/10 backdrop-blur-sm p-0 sm:p-4">
      <div className="h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center shrink-0">
              <FlaskConical className="w-4.5 h-4.5 text-navy" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">
                {initialData ? 'Edit Incubation Record' : 'Log New Sample'}
              </h2>
              {initialData?.sample_name && (
                <p className="text-xs font-mono text-slate-400 mt-0.5">{initialData.sample_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex border-b border-slate-100 px-5 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`py-2.5 px-3 text-xs font-black border-b-2 transition-colors mr-1 whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-navy text-navy'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
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
                    {errors.sample_name && <p className="text-red-500 text-xs mt-1">{errors.sample_name.message}</p>}
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

                <div className="space-y-3 pt-3 border-t border-slate-100">
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
                    {errors.start_time && <p className="text-red-500 text-xs mt-1">{errors.start_time.message}</p>}
                  </div>

                </div>

                {/* Media */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <p className={labelCls}>Media</p>

                  <div>
                    <label className={labelCls}>Approved Recipe</label>
                    <select
                      value={selectedRecipeId}
                      onChange={e => {
                        const id = e.target.value;
                        setSelectedRecipeId(id);
                        if (id) {
                          const recipe = mediaRecipes.find(r => r.id === id);
                          if (recipe) {
                            setValue('media_used', recipe.name);
                            const rName = recipe.name.toLowerCase();
                            const match = mediaItems.find(m =>
                              m.name.toLowerCase().includes(rName) || rName.includes(m.name.toLowerCase())
                            );
                            setSelectedMediaItemId(match?.id || '');
                          }
                        } else {
                          setValue('media_used', '');
                          setSelectedMediaItemId('');
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">-- No approved recipe --</option>
                      {mediaRecipes.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.code ? `${r.code} — ` : ''}{r.name} v{r.version}{r.category ? ` (${r.category})` : ''}
                        </option>
                      ))}
                    </select>
                    {mediaRecipes.length === 0 && (
                      <p className="text-xs text-amber-500 mt-1">No approved recipes found. Go to Recipe Management and approve a formulation.</p>
                    )}
                  </div>

                  {selectedRecipeId ? (
                    <div className={`rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-semibold ${selectedMediaItemId ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-amber-50 border border-amber-100 text-amber-700'}`}>
                      {selectedMediaItemId
                        ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Will deduct from inventory: {mediaItems.find(m => m.id === selectedMediaItemId)?.name}</>
                        : <><AlertCircle className="w-3.5 h-3.5 shrink-0" /> No matching inventory item found — stock won&apos;t be deducted</>
                      }
                    </div>
                  ) : (
                    <div>
                      <label className={labelCls}>Media Name</label>
                      <input {...register('media_used')} className={inputCls} placeholder="e.g. MRS Broth, TSA" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Volume Used (mL)</label>
                      <input
                        type="number" step="any" min="0"
                        value={mediaVolumeUsed}
                        onChange={e => setMediaVolumeUsed(e.target.value)}
                        placeholder="e.g. 250"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Lot / Batch No</label>
                      <input {...register('media_lot')} className={inputCls} placeholder="LOT-2024-0053" />
                    </div>
                  </div>
                </div>

                {/* Dilution Series section - Agar Plate only */}
                {sampleType === 'Agar Plate' && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
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
                        <p className="text-xs text-slate-400 mt-1">0.001 = 10^-3</p>
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
                      <label className={labelCls}>Plate Photo URL <span className="text-slate-400 font-normal normal-case">(G-72 — optional)</span></label>
                      <input type="url" {...register('plate_image_url')} className={inputCls} placeholder="https://... (link to plate photo)"/>
                    </div>
                    {/* G-73: Duplicate flag */}
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="is_dup" {...register('is_duplicate')} className="w-4 h-4 rounded border-slate-300"/>
                      <label htmlFor="is_dup" className="text-xs font-bold text-slate-700">Mark as Duplicate Plate (triplicate / QC check)</label>
                    </div>

                    {/* CFU/mL preview */}
                    {cfuPreview !== null && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">
                          CFU/mL Preview
                        </p>
                        <p className="text-sm font-black text-amber-800 font-mono">
                          {cfuPreview.toExponential(2)} CFU/mL
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          = colony_count / (dilution_factor x volume_plated_ml)
                        </p>
                      </div>
                    )}

                    {/* Show formula hint even when no values yet */}
                    {cfuPreview === null && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
                          CFU/mL Formula
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                          CFU/mL = colony_count / (dilution_factor x volume_plated_ml)
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
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
                              : 'bg-white text-slate-600 border-slate-200 hover:border-navy hover:text-navy hover:bg-navy/5'
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
                        className="w-14 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-navy text-center"
                      />
                      <button
                        type="button"
                        onClick={() => addRead(customHour)}
                        disabled={!customHour}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-600 transition disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* CFU preview in reads tab */}
                {cfuPreview !== null && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">
                      Auto-calculated CFU/mL
                    </p>
                    <p className="text-sm font-black text-amber-800 font-mono">
                      {cfuPreview.toExponential(2)} CFU/mL
                    </p>
                    <p className="text-xs text-amber-500 mt-0.5">
                      Based on latest colony count in reads + dilution settings from Setup tab.
                    </p>
                  </div>
                )}

                {/* Read cards */}
                {plateReads.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-2xl">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-xs font-bold text-slate-400">No plate reads logged yet.</p>
                    <p className="text-xs text-slate-300 mt-1">Use the buttons above to add reads at 12h, 24h, 36h or 48h.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {plateReads.map(read => (
                      <div key={read.hour} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/40">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-navy font-mono">T+{read.hour}h Read</span>
                            {read.recorded_by && (
                              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                Logged by: {read.recorded_by}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRead(read.hour)}
                            className="p-1 text-slate-300 hover:text-red-400 transition-colors rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Status chips */}
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Plate Status</p>
                          <div className="flex flex-wrap gap-1.5">
                            {READ_STATUSES.map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => updateRead(read.hour, 'status', opt.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                                  read.status === opt.value
                                    ? `${opt.cls} shadow-sm`
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {sampleType === 'Agar Plate' ? (
                            <div>
                              <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Colony Count</label>
                              <input
                                type="number"
                                min="0"
                                value={read.colony_count}
                                onChange={e => updateRead(read.hour, 'colony_count', e.target.value)}
                                placeholder="e.g. 50"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition bg-white"
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">OD Value</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={read.od_value || ''}
                                  onChange={e => updateRead(read.hour, 'od_value', e.target.value)}
                                  placeholder="0.500"
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">pH Value</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={read.ph_value || ''}
                                  onChange={e => updateRead(read.hour, 'ph_value', e.target.value)}
                                  placeholder="4.2"
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition bg-white"
                                />
                              </div>
                            </div>
                          )}
                          <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Notes</label>
                            <input
                              type="text"
                              value={read.notes}
                              onChange={e => updateRead(read.hour, 'notes', e.target.value)}
                              placeholder="Observations..."
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Final note */}
                <div className="pt-3 border-t border-slate-100">
                  <label className={labelCls}>Final Note / Overall Conclusion</label>
                  <textarea
                    value={finalNote}
                    onChange={e => setFinalNote(e.target.value)}
                    rows={2}
                    placeholder="e.g. Clean growth at 48h, no contamination observed."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-navy transition resize-none bg-white"
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
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-black ${
                          sterility === opt.value
                            ? opt.cls
                            : 'border-slate-100 text-slate-300 hover:border-slate-200 hover:text-slate-500 bg-white'
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
                    <label className={labelCls}>Colony Count <span className="text-slate-400 font-normal normal-case text-xs">(G-89: manual count — use colony counter tool and enter result)</span></label>
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
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">
                      Auto-calculated
                    </p>
                    <p className="text-sm font-black text-amber-800 font-mono">
                      {autoCfu.toExponential(2)} CFU/mL
                    </p>
                    <p className="text-xs text-amber-500 mt-0.5">
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
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
                      <MorphologyPicker
                        value={colonyMorph}
                        onChange={(val) => setValue('colony_morphology', val)}
                      />
                    </div>
                    {colonyMorph && (
                      <div className="mt-2">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Stored as JSON</p>
                        <p className="text-xs font-mono text-slate-400 break-all">{colonyMorph}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Staining */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
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
          <div className="shrink-0 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl text-sm transition-colors border border-slate-200"
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
