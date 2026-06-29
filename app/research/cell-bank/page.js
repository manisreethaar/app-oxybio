'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Plus, Dna, ChevronRight, Search, ExternalLink, ChevronDown, Beaker, AlertTriangle, BookOpen, Pencil, X, Trash2, CheckCircle2 } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CreatorBadge from '@/components/ui/CreatorBadge';

const STATUS_COLOR = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Discarded':   'bg-red-100 text-red-600',
};

const SOURCE_COLOR = {
  MTCC:     'bg-indigo-100 text-indigo-700',
  NCIM:     'bg-slate-100 text-slate-700',
  Isolated: 'bg-slate-100 text-slate-700',
  Other:    'bg-gray-100 text-gray-600',
};

const CHAR_FIELDS = [
  { key: 'gram_stain',         label: 'Gram Stain',           type: 'select', options: ['Positive', 'Negative', 'Variable'] },
  { key: 'cell_shape',         label: 'Cell Shape',           type: 'select', options: ['Rod', 'Coccus', 'Spiral', 'Other'] },
  { key: 'motility',           label: 'Motility',             type: 'select', options: ['Yes', 'No'] },
  { key: 'catalase',           label: 'Catalase',             type: 'select', options: ['Positive', 'Negative'] },
  { key: 'oxidase',            label: 'Oxidase',              type: 'select', options: ['Positive', 'Negative'] },
  { key: 'rna_16s_accession',  label: '16S rRNA Accession No.', type: 'text' },
  { key: 'biochemical_notes',  label: 'Biochemical Notes',   type: 'textarea' },
  { key: 'genome_notes',       label: 'Genome / Plasmid Notes', type: 'textarea' },
];

function isCharacterized(char) {
  if (!char || typeof char !== 'object') return false;
  return Object.values(char).some(v => v && String(v).trim() !== '');
}

function recipeLabel(recipe) {
  if (!recipe) return '';
  return `${recipe.code ? `${recipe.code} - ` : ''}${recipe.name}${recipe.version ? ` v${recipe.version}` : ''}`;
}

// ---- Characterization panel -----------------------------------------------
function CharacterizationPanel({ strain, isAdmin, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(strain.characterization || {});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const char = strain.characterization || {};
  const characterized = isCharacterized(char);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/research/cell-bank/${strain.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'strain', name: strain.name, source_type: strain.source_type, characterization: form }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Characterization saved.');
      onSaved({ ...strain, characterization: form });
      setEditing(false);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${characterized ? 'bg-emerald-500' : 'bg-gray-300'}`}/>
        <span className={`text-[10px] font-bold ${characterized ? 'text-emerald-700' : 'text-gray-400'}`}>
          {characterized ? 'Characterized' : 'Not characterized'}
        </span>
        {isAdmin && !editing && (
          <button onClick={() => { setForm(strain.characterization || {}); setEditing(true); }}
            className="ml-auto text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-0.5">
            <Pencil className="w-2.5 h-2.5"/> {characterized ? 'Edit' : 'Fill in'}
          </button>
        )}
        {editing && (
          <button onClick={() => setEditing(false)} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="w-3 h-3"/>
          </button>
        )}
      </div>

      {!editing && characterized && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-4">
          {CHAR_FIELDS.filter(f => char[f.key]).map(f => (
            <div key={f.key} className="p-1.5 bg-gray-50 rounded-lg">
              <p className="text-[8px] font-black text-gray-400 uppercase">{f.label}</p>
              <p className="text-[10px] font-bold text-gray-700 truncate">{char[f.key]}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="pl-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CHAR_FIELDS.map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <label className="field-label">{f.label}</label>
                {f.type === 'select' ? (
                  <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="field-input bg-white text-xs">
                    <option value="">-- select --</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea rows={2} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/>
                ) : (
                  <input value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="field-input text-xs"/>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Strain form (new) -----------------------------------------------------
function StrainForm({ formulations, initialFormulationId, onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', source_type: 'MTCC', formulation_id: initialFormulationId || '', accession_number: '', strain_short_code: '', isolation_source: '', received_date: '', taxonomy: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const n = (v) => (v === '' ? null : v);
      const res = await fetch('/api/research/cell-bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'strain', ...form, formulation_id: n(form.formulation_id), accession_number: n(form.accession_number), isolation_source: n(form.isolation_source), received_date: n(form.received_date), taxonomy: n(form.taxonomy), notes: n(form.notes) }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Strain registered.');
      onSave(json.data);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="surface p-5 space-y-4">
      <p className="text-sm font-bold text-gray-900">Register New Strain</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className="field-label">Strain Name / Organism <span className="text-red-500">*</span></label>
          <input required value={form.name} onChange={e => set('name', e.target.value)} className="field-input" placeholder="e.g. Lactobacillus brevis MTCC 1408"/></div>
        <div className="sm:col-span-2"><label className="field-label">Linked Recipe / Formulation</label>
          <select value={form.formulation_id} onChange={e => set('formulation_id', e.target.value)} className="field-input bg-white">
            <option value="">No linked recipe yet</option>
            {formulations.map(f => <option key={f.id} value={f.id}>{recipeLabel(f)} ({f.category})</option>)}
          </select>
          <p className="text-[10px] text-gray-400 mt-0.5">This keeps strain lineage tied back to the recipe or media definition it belongs with.</p>
        </div>
        <div><label className="field-label">Source</label>
          <select value={form.source_type} onChange={e => set('source_type', e.target.value)} className="field-input bg-white">
            {['MTCC','NCIM','Isolated','Other'].map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="field-label">Accession / Lot #</label>
          <input value={form.accession_number} onChange={e => set('accession_number', e.target.value)} className="field-input" placeholder="MTCC-1408"/></div>
        <div>
          <label className="field-label">Strain Short Code <span className="text-red-500">*</span></label>
          <input required maxLength={4} value={form.strain_short_code} onChange={e => set('strain_short_code', e.target.value.toUpperCase())} className="field-input font-mono" placeholder="LB"/>
          <p className="text-[9px] text-gray-400 mt-0.5">2-4 letters used in vial codes e.g. <strong>MCB-26-LB-001</strong></p>
        </div>
        <div><label className="field-label">Isolation Source</label>
          <input value={form.isolation_source} onChange={e => set('isolation_source', e.target.value)} className="field-input" placeholder="Fermented rice"/></div>
        <div><label className="field-label">Date Received</label>
          <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className="field-input"/></div>
        <div className="sm:col-span-2"><label className="field-label">Taxonomy</label>
          <input value={form.taxonomy} onChange={e => set('taxonomy', e.target.value)} className="field-input" placeholder="Firmicutes > Lactobacillales > Lactobacillaceae"/></div>
        <div className="sm:col-span-2"><label className="field-label">Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving || !form.strain_short_code} className="flex-1 py-2 bg-navy text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Saving...' : 'Register Strain'}</button>
      </div>
    </form>
  );
}

// ---- Edit strain form ------------------------------------------------------
function EditStrainForm({ strain, formulations, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:              strain.name || '',
    source_type:       strain.source_type || 'MTCC',
    formulation_id:    strain.formulation_id || '',
    accession_number:  strain.accession_number || '',
    strain_short_code: strain.strain_short_code || '',
    isolation_source:  strain.isolation_source || '',
    received_date:     strain.received_date ? strain.received_date.slice(0, 10) : '',
    taxonomy:          strain.taxonomy || '',
    notes:             strain.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Strain name is required.');
      return;
    }

    setSaving(true);
    try {
      const n = (v) => (v === '' ? null : v);
      const res = await fetch(`/api/research/cell-bank/${strain.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'strain',
          ...form,
          name: form.name.trim(),
          formulation_id: n(form.formulation_id),
          accession_number: n(form.accession_number),
          strain_short_code: n(form.strain_short_code),
          isolation_source: n(form.isolation_source),
          received_date: n(form.received_date),
          taxonomy: n(form.taxonomy),
          notes: n(form.notes),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update strain.');
      toast.success('Strain updated.');
      onSave(json.data);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="surface p-5 space-y-4 border-2 border-indigo-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><Pencil className="w-4 h-4 text-indigo-500"/>Edit Strain</p>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className="field-label">Strain Name / Organism <span className="text-red-500">*</span></label>
          <input required value={form.name} onChange={e => set('name', e.target.value)} className="field-input" placeholder="e.g. Lactobacillus brevis MTCC 1408"/></div>
        <div className="sm:col-span-2"><label className="field-label">Linked Recipe / Formulation</label>
          <select value={form.formulation_id} onChange={e => set('formulation_id', e.target.value)} className="field-input bg-white">
            <option value="">No linked recipe</option>
            {formulations.map(f => <option key={f.id} value={f.id}>{recipeLabel(f)} ({f.category})</option>)}
          </select></div>
        <div><label className="field-label">Source</label>
          <select value={form.source_type} onChange={e => set('source_type', e.target.value)} className="field-input bg-white">
            {['MTCC','NCIM','Isolated','Other'].map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="field-label">Accession / Lot #</label>
          <input value={form.accession_number} onChange={e => set('accession_number', e.target.value)} className="field-input" placeholder="MTCC-1408"/></div>
        <div>
          <label className="field-label">Strain Short Code</label>
          <input maxLength={4} value={form.strain_short_code} onChange={e => set('strain_short_code', e.target.value.toUpperCase())} className="field-input font-mono" placeholder="LB"/>
          {form.strain_short_code ? (
            <p className="text-[9px] text-gray-400 mt-0.5">2-4 letters used in vial codes</p>
          ) : (
            <p className="text-[9px] text-amber-600 font-semibold mt-0.5">Short code is recommended for vial code generation.</p>
          )}
        </div>
        <div><label className="field-label">Isolation Source</label>
          <input value={form.isolation_source} onChange={e => set('isolation_source', e.target.value)} className="field-input" placeholder="Fermented rice"/></div>
        <div><label className="field-label">Date Received</label>
          <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className="field-input"/></div>
        <div className="sm:col-span-2"><label className="field-label">Taxonomy</label>
          <input value={form.taxonomy} onChange={e => set('taxonomy', e.target.value)} className="field-input" placeholder="Firmicutes > Lactobacillales > Lactobacillaceae"/></div>
        <div className="sm:col-span-2"><label className="field-label">Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </form>
  );
}

// ---- New prep form ---------------------------------------------------------
function NewPrepForm({ strains, formulations, initialFormulationId, initialStrainId, onSave, onCancel }) {
  const getStrainRecipe = useCallback((strainId) => strains.find(s => s.id === strainId)?.formulation_id || '', [strains]);
  const defaultStrainId = initialStrainId || strains[0]?.id || '';
  const [form, setForm] = useState({
    strain_id: defaultStrainId,
    type: 'MCB',
    formulation_id: initialFormulationId || getStrainRecipe(defaultStrainId),
    passage_number: '',
    parent_id: '',
    source_vial_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [parentVials, setParentVials] = useState([]);
  const [loadingVials, setLoadingVials] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mcbPreps = useMemo(() => strains.length ? [] : [], []); // populated separately via preps prop -- not needed here

  useEffect(() => {
    setForm(f => {
      const strainId = initialStrainId || f.strain_id || strains[0]?.id || '';
      return {
        ...f,
        strain_id: strainId,
        formulation_id: initialFormulationId || (initialStrainId ? getStrainRecipe(strainId) : f.formulation_id || getStrainRecipe(strainId)),
      };
    });
  }, [strains, initialStrainId, initialFormulationId, getStrainRecipe]);

  // Fetch available MCB vials when parent_id changes
  useEffect(() => {
    if (!form.parent_id || (form.type !== 'WCB' && form.type !== 'RCB')) {
      setParentVials([]);
      set('source_vial_id', '');
      return;
    }
    setLoadingVials(true);
    fetch(`/api/research/cell-bank/vials?status=Available&preparation_id=${form.parent_id}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setParentVials(json.data || []);
      })
      .catch(() => {})
      .finally(() => setLoadingVials(false));
  }, [form.parent_id, form.type]);

  const handleStrainChange = (strainId) => {
    setForm(f => ({ ...f, strain_id: strainId, formulation_id: f.formulation_id || getStrainRecipe(strainId), parent_id: '', source_vial_id: '' }));
  };

  const handleTypeChange = (type) => {
    setForm(f => ({ ...f, type, parent_id: '', source_vial_id: '', passage_number: '' }));
  };

  const handleParentChange = (parentId) => {
    // Auto-set passage number based on parent's passage_number
    // We don't have it here directly, so just increment from 1 as default
    set('parent_id', parentId);
    set('source_vial_id', '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const n = (v) => (v === '' ? null : v);
      const res = await fetch('/api/research/cell-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          formulation_id: n(form.formulation_id),
          parent_id: n(form.parent_id),
          source_vial_id: n(form.source_vial_id),
          passage_number: n(form.passage_number),
          notes: n(form.notes),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Preparation started.');
      onSave(json.data);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const needsParent = form.type === 'WCB' || form.type === 'RCB';
  // For parent selector, we need the list of preps -- we'll fetch inline via strain_id
  const [availableParents, setAvailableParents] = useState([]);
  useEffect(() => {
    if (!needsParent || !form.strain_id) { setAvailableParents([]); return; }
    fetch(`/api/research/cell-bank?view=preparations&strain_id=${form.strain_id}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setAvailableParents((json.data || []).filter(p => p.type === 'MCB'));
      })
      .catch(() => {});
  }, [form.strain_id, needsParent]);

  return (
    <form onSubmit={handleSubmit} className="surface p-5 space-y-4">
      <p className="text-sm font-bold text-gray-900">Start New Cell Bank Preparation</p>
      <p className="text-xs text-gray-500">Prep code auto-generated: <span className="font-mono font-bold">OB-CB-{new Date().getFullYear()}-NNN</span></p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className="field-label">Strain <span className="text-red-500">*</span></label>
          <select required value={form.strain_id} onChange={e => handleStrainChange(e.target.value)} className="field-input bg-white">
            <option value="">Select strain...</option>
            {strains.map(s => <option key={s.id} value={s.id}>{s.name} ({s.source_type}{s.accession_number ? ' ' + s.accession_number : ''})</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className="field-label">Linked Recipe / Formulation</label>
          <select value={form.formulation_id} onChange={e => set('formulation_id', e.target.value)} className="field-input bg-white">
            <option value="">Use strain default / not linked</option>
            {formulations.map(f => <option key={f.id} value={f.id}>{recipeLabel(f)} ({f.category})</option>)}
          </select>
          <p className="text-[10px] text-gray-400 mt-0.5">This recipe appears on the Cell Bank prep and can be opened from Recipe Management.</p>
        </div>
        <div><label className="field-label">Type</label>
          <select value={form.type} onChange={e => handleTypeChange(e.target.value)} className="field-input bg-white">
            <option value="MCB">MCB -- Master Cell Bank</option>
            <option value="WCB">WCB -- Working Cell Bank</option>
            <option value="RCB">RCB -- Research Cell Bank</option>
          </select></div>
        <div><label className="field-label">Passage Number</label>
          <input type="number" min="0" value={form.passage_number} onChange={e => set('passage_number', e.target.value)} className="field-input" placeholder={needsParent ? '2' : '1'}/></div>

        {needsParent && (
          <>
            <div className="sm:col-span-2">
              <label className="field-label">Parent MCB Preparation</label>
              <select value={form.parent_id} onChange={e => handleParentChange(e.target.value)} className="field-input bg-white">
                <option value="">Select parent MCB...</option>
                {availableParents.map(p => (
                  <option key={p.id} value={p.id}>{p.prep_code}{p.passage_number != null ? ` (P${p.passage_number})` : ''}</option>
                ))}
              </select>
            </div>
            {form.parent_id && (
              <div className="sm:col-span-2">
                <label className="field-label">Source MCB Vial</label>
                {loadingVials ? (
                  <p className="text-xs text-gray-400">Loading vials...</p>
                ) : (
                  <select value={form.source_vial_id} onChange={e => set('source_vial_id', e.target.value)} className="field-input bg-white">
                    <option value="">Select source vial (optional)...</option>
                    {parentVials.map(v => (
                      <option key={v.id} value={v.id}>{v.vial_code}{v.storage_temp ? ` - ${v.storage_temp}` : ''}</option>
                    ))}
                  </select>
                )}
                {parentVials.length === 0 && !loadingVials && (
                  <p className="text-[10px] text-amber-600 mt-0.5">No available vials found for the selected MCB.</p>
                )}
              </div>
            )}
          </>
        )}

        <div className="sm:col-span-2"><label className="field-label">Notes</label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} className="field-input"/></div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving || !form.strain_id} className="flex-1 py-2 bg-navy text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Creating...' : 'Start Preparation'}</button>
      </div>
    </form>
  );
}

// ---- Main page -------------------------------------------------------------
export default function CellBankPage() {
  const { role } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [requestedFormulationId, setRequestedFormulationId] = useState('');
  const [tab, setTab] = useState('preparations');
  const [strains, setStrains] = useState([]);
  const [preps, setPreps] = useState([]);
  const [formulations, setFormulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStrainForm, setShowStrainForm] = useState(false);
  const [showPrepForm, setShowPrepForm] = useState(false);
  const [prepStrainId, setPrepStrainId] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [strainBatches, setStrainBatches] = useState({});
  const [expandedStrainId, setExpandedStrainId] = useState(null);
  const [editingStrainId, setEditingStrainId] = useState(null);
  const [confirmDeleteStrainId, setConfirmDeleteStrainId] = useState(null);
  const [confirmDeletePrepId, setConfirmDeletePrepId] = useState(null);
  const [lowVialDismissed, setLowVialDismissed] = useState(false);
  const [releasingPrepId, setReleasingPrepId] = useState(null);
  const [confirmReleaseId, setConfirmReleaseId] = useState(null);
  const isAdmin    = ['admin', 'ceo', 'cto', 'research_fellow'].includes(role);
  const canDelete  = ['admin', 'ceo', 'cto'].includes(role);

  useEffect(() => {
    setRequestedFormulationId(new URLSearchParams(window.location.search).get('formulation_id') || '');
  }, []);

  const fetchStrainBatches = async (strainId) => {
    const { data: strainPreps } = await supabase
      .from('cell_bank_preparations')
      .select('id')
      .eq('strain_id', strainId);
    if (!strainPreps?.length) return [];

    const { data: vials } = await supabase
      .from('cell_bank_vials')
      .select('id')
      .in('preparation_id', strainPreps.map(p => p.id));
    if (!vials?.length) return [];

    const { data: inocs } = await supabase
      .from('batch_flask_inoculations')
      .select('batch_id, batches(id, batch_id, status, start_time)')
      .in('cell_bank_vial_id', vials.map(v => v.id));

    const seen = new Set();
    return (inocs || []).filter(i => {
      if (!i.batches || seen.has(i.batch_id)) return false;
      seen.add(i.batch_id);
      return true;
    });
  };

  const handleToggleStrainBatches = async (strainId) => {
    if (expandedStrainId === strainId) {
      setExpandedStrainId(null);
      return;
    }
    setExpandedStrainId(strainId);
    if (strainBatches[strainId] !== undefined) return;
    const results = await fetchStrainBatches(strainId);
    setStrainBatches(prev => ({ ...prev, [strainId]: results }));
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes, fRes] = await Promise.all([
        fetch('/api/research/cell-bank?view=strains'),
        fetch('/api/research/cell-bank?view=preparations'),
        fetch('/api/formulations'),
      ]);
      const [sJson, pJson, fJson] = await Promise.all([sRes.json(), pRes.json(), fRes.json()]);
      if (sJson.success) setStrains(sJson.data || []);
      if (pJson.success) setPreps(pJson.data || []);
      if (Array.isArray(fJson)) setFormulations(fJson.filter(f => f.status === 'Approved'));
    } catch (err) { toast.error('Failed to load cell bank data'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (requestedFormulationId) {
      setShowPrepForm(true);
      setShowStrainForm(false);
    }
  }, [requestedFormulationId]);

  // Compute low-vial strains: total registered vials < 3 OR any vial expiring within 30 days
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const today = new Date();

  const lowVialStrains = strains.filter(s => {
    const strainPreps = preps.filter(p => p.strain_id === s.id);
    const totalVials = strainPreps.reduce((sum, p) => sum + (p.vial_count || 0), 0);
    return totalVials > 0 && totalVials < 3;
  });

  // Gather expiry warnings: fetch vials with expires_at from preps list (not available here directly -- check via preps)
  // We'll show a simple computed message using data available
  const expiryWarnStrains = strains.filter(s => {
    const strainPreps = preps.filter(p => p.strain_id === s.id);
    return strainPreps.length > 0;
  });

  const filteredPreps = preps.filter(p => {
    const matchType = typeFilter === 'all' || p.type === typeFilter;
    const matchSearch = !search || p.prep_code?.toLowerCase().includes(search.toLowerCase()) || p.cell_bank_strains?.name?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const filteredStrains = strains.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.accession_number?.toLowerCase().includes(search.toLowerCase()));

  const handleDeletePrep = async (id) => {
    const res = await fetch(`/api/research/cell-bank/${id}?target=preparation`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      toast.success('Preparation deleted.');
      fetchAll();
    } else if (json.blocked) {
      // Offer Discard as safe alternative when deletion is blocked
      toast.error(json.error);
      const shouldDiscard = window.confirm(
        `Delete is blocked.\n\n${json.error}\n\nClick OK to DISCARD this preparation instead (marks it as inactive, keeps all data).`
      );
      if (shouldDiscard) {
        const discardRes = await fetch(`/api/research/cell-bank/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Discarded' }),
        });
        const discardJson = await discardRes.json();
        if (discardJson.success) { toast.success('Preparation marked as Discarded.'); fetchAll(); }
        else toast.error(discardJson.error || 'Discard failed.');
      }
    } else {
      toast.error(json.error);
    }
  };

  const handleDeleteStrain = async (id) => {
    const res = await fetch(`/api/research/cell-bank/${id}?target=strain`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Strain deleted.'); fetchAll(); }
    else if (json.blocked) {
      toast.error(json.error);
    } else {
      toast.error(json.error);
    }
  };

  const handleQcRelease = async (prepId) => {
    setReleasingPrepId(prepId);
    try {
      const res = await fetch(`/api/research/cell-bank/${prepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qc_release' }),
      });
      const json = await res.json();
      if (!json.data && !json.success) throw new Error(json.error || 'Release failed');
      toast.success('Preparation QC released.');
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setReleasingPrepId(null); setConfirmReleaseId(null); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Cell Bank</h1>
          <p className="text-xs text-gray-500 mt-0.5">Master Cell Bank (MCB) and Working Cell Bank (WCB) management</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button onClick={() => { setShowStrainForm(v => !v); setShowPrepForm(false); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm">
                <Dna className="w-3.5 h-3.5"/> Add Strain
              </button>
              <button onClick={() => { setPrepStrainId(''); setShowPrepForm(v => !v); setShowStrainForm(false); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-navy text-white rounded-xl text-xs font-bold shadow-sm hover:bg-navy/90">
                <Plus className="w-3.5 h-3.5"/> New Preparation
              </button>
            </>
          )}
        </div>
      </div>

      {requestedFormulationId && (
        <div className="surface p-4 bg-blue-50 border border-blue-100 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-navy shrink-0 mt-0.5"/>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">Recipe linked from Recipe Management</p>
            <p className="text-xs text-gray-600 mt-0.5">The new preparation form is pre-selected to carry this recipe relationship into the Cell Bank record.</p>
          </div>
        </div>
      )}

      {/* Low Vial Stock Warning */}
      {lowVialStrains.length > 0 && !lowVialDismissed && (
        <div className="surface p-4 bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">Low Vial Stock Warning</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {lowVialStrains.map(s => s.name).join(', ')} -- fewer than 3 vials remaining. Consider preparing a new Working Cell Bank.
            </p>
          </div>
          <button onClick={() => setLowVialDismissed(true)} className="text-amber-400 hover:text-amber-700 transition-colors shrink-0" aria-label="Dismiss">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Strains',          value: strains.length,                              color: 'text-indigo-600' },
          { label: 'Total Preps',      value: preps.length,                                color: 'text-navy' },
          { label: 'MCB',              value: preps.filter(p => p.type === 'MCB').length,  color: 'text-emerald-600' },
          { label: 'WCB',              value: preps.filter(p => p.type === 'WCB').length,  color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="surface p-4 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 font-bold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Forms */}
      {showStrainForm && (
        <StrainForm
          formulations={formulations}
          initialFormulationId={requestedFormulationId}
          onSave={(d) => { setStrains(v => [d, ...v]); setShowStrainForm(false); }}
          onCancel={() => setShowStrainForm(false)}
        />
      )}
      {showPrepForm && (
        <NewPrepForm
          strains={strains}
          formulations={formulations}
          initialFormulationId={requestedFormulationId}
          initialStrainId={prepStrainId}
          onSave={() => { fetchAll(); setShowPrepForm(false); setPrepStrainId(''); }}
          onCancel={() => { setShowPrepForm(false); setPrepStrainId(''); }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {[['preparations', 'Preparations'], ['strains', 'Strain Registry']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === v ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none"/>
        </div>
        {tab === 'preparations' && (
          <div className="flex gap-1">
            {['all', 'MCB', 'WCB', 'RCB'].map(f => (
              <button key={f} onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${typeFilter === f ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                {f === 'all' ? 'All Types' : f}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl"/>)}</div>
      ) : tab === 'preparations' ? (
        filteredPreps.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No preparations found. Start one using the button above.</div>
        ) : (
          <div className="space-y-2">
            {filteredPreps.map(p => {
              const passageNum = (p.passage_number != null && p.passage_number > 0) ? p.passage_number : 1;
              return (
                <Link key={p.id} href={`/research/cell-bank/${p.id}`}
                  className="surface p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${p.type === 'MCB' ? 'bg-emerald-100 text-emerald-700' : p.type === 'RCB' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.type}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-gray-900">{p.prep_code}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-600">P{passageNum}</span>
                      {p.qc_released ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5"/> QC Released
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                          Awaiting QC
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{p.cell_bank_strains?.name}</p>
                    {(p.linked_formulation || p.cell_bank_strains?.linked_formulation) && (
                      <p className="text-[10px] text-navy font-bold mt-0.5 flex items-center gap-1 truncate">
                        <BookOpen className="w-3 h-3 shrink-0"/>
                        {recipeLabel(p.linked_formulation || p.cell_bank_strains?.linked_formulation)}
                      </p>
                    )}
                    {p.type === 'WCB' && p.parent && <p className="text-[10px] text-gray-400 font-semibold">from MCB: {p.parent.prep_code}</p>}
                  </div>
                  <div className="text-right shrink-0 mr-2 flex flex-col items-end gap-1">
                    {p.vial_count > 0 && <p className="text-xs font-black text-gray-700">{p.vial_count} vials</p>}
                    <p className="text-[10px] text-gray-400">{new Date(p.created_at).toLocaleDateString('en-IN')}</p>
                    {p.employees && (
                      <CreatorBadge initials={p.employees.initials} fullName={p.employees.full_name} />
                    )}
                    {isAdmin && !p.qc_released && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmReleaseId(p.id); }}
                        className="text-[10px] text-orange-600 hover:text-orange-800 font-bold border border-orange-200 rounded px-1.5 py-0.5 bg-orange-50 hover:bg-orange-100 transition-colors"
                      >
                        Release
                      </button>
                    )}
                  </div>
                  {canDelete && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeletePrepId(p.id); }}
                      className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="Delete Preparation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0"/>
                </Link>
              );
            })}
          </div>
        )
      ) : (
        filteredStrains.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No strains registered. Use &quot;Add Strain&quot; to register one.</div>
        ) : (
          <div className="space-y-2">
            {filteredStrains.map(s => {
              const isExpanded = expandedStrainId === s.id;
              const batchList = strainBatches[s.id];
              return (
                <div key={s.id} className="surface overflow-hidden">
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                      <Dna className="w-5 h-5 text-indigo-600"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-gray-900">{s.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SOURCE_COLOR[s.source_type] || 'bg-gray-100 text-gray-600'}`}>{s.source_type}</span>
                        {s.accession_number && <span className="text-[10px] text-gray-500 font-semibold">{s.accession_number}</span>}
                      </div>
                      {s.taxonomy && <p className="text-xs text-gray-500 mt-0.5 truncate">{s.taxonomy}</p>}
                      {s.isolation_source && <p className="text-[10px] text-gray-400">Source: {s.isolation_source}</p>}
                      {s.linked_formulation && (
                        <p className="text-[10px] text-navy font-bold mt-0.5 flex items-center gap-1 truncate">
                          <BookOpen className="w-3 h-3 shrink-0"/>
                          {recipeLabel(s.linked_formulation)}
                        </p>
                      )}
                      {/* Characterization panel */}
                      <CharacterizationPanel
                        strain={s}
                        isAdmin={isAdmin}
                        onSaved={(updated) => setStrains(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
                      />
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-[10px] text-gray-400">{s.received_date ? new Date(s.received_date).toLocaleDateString('en-IN') : '--'}</p>
                      <button onClick={() => { setPrepStrainId(s.id); setTab('preparations'); setShowPrepForm(true); setShowStrainForm(false); }}
                        className="text-[10px] text-navy font-bold hover:underline flex items-center gap-1 ml-auto">
                        <Plus className="w-3 h-3"/> New Prep
                      </button>
                      {isAdmin && (
                        <button onClick={() => setEditingStrainId(editingStrainId === s.id ? null : s.id)}
                          className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1 ml-auto">
                          <Pencil className="w-3 h-3"/> Edit
                        </button>
                      )}
                      {canDelete && <button onClick={() => setConfirmDeleteStrainId(s.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold">Delete</button>}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingStrainId === s.id && (
                    <div className="px-4 pb-4 border-t border-indigo-100">
                      <EditStrainForm
                        strain={s}
                        formulations={formulations}
                        onSave={(updated) => {
                          setStrains(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
                          setEditingStrainId(null);
                        }}
                        onCancel={() => setEditingStrainId(null)}
                      />
                    </div>
                  )}

                  {/* Batches toggle button */}
                  <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                    <button
                      onClick={() => handleToggleStrainBatches(s.id)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      <Beaker className="w-3 h-3"/>
                      {batchList === undefined && !isExpanded
                        ? 'Show batches using this strain'
                        : batchList === undefined && isExpanded
                        ? 'Loading batches...'
                        : `Used in ${batchList.length} batch${batchList.length === 1 ? '' : 'es'}`
                      }
                      <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                    </button>
                    {isExpanded && batchList !== undefined && (
                      <div className="mt-2 space-y-1">
                        {batchList.length === 0 ? (
                          <p className="text-[10px] text-gray-400 pl-1">No batches have used a vial from this strain&apos;s preparations.</p>
                        ) : (
                          batchList.map(item => (
                            <Link
                              key={item.batch_id}
                              href={`/batches/${item.batch_id}`}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors group"
                            >
                              <span className="text-[10px] font-black text-indigo-700 font-mono">{item.batches.batch_id}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  item.batches.status === 'released' ? 'bg-emerald-100 text-emerald-700' :
                                  item.batches.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                  'bg-blue-100 text-blue-700'
                                }`}>{item.batches.status}</span>
                                {item.batches.start_time && (
                                  <span className="text-[9px] text-gray-400">{new Date(item.batches.start_time).toLocaleDateString('en-IN')}</span>
                                )}
                                <ExternalLink className="w-2.5 h-2.5 text-indigo-400 group-hover:text-indigo-600"/>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteStrainId}
        onClose={() => setConfirmDeleteStrainId(null)}
        onConfirm={() => {
          handleDeleteStrain(confirmDeleteStrainId);
          setConfirmDeleteStrainId(null);
        }}
        title="Delete Strain"
        message="Are you sure you want to delete this strain? All linked preparations will also be removed."
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!confirmDeletePrepId}
        onClose={() => setConfirmDeletePrepId(null)}
        onConfirm={() => {
          handleDeletePrep(confirmDeletePrepId);
          setConfirmDeletePrepId(null);
        }}
        title="Delete Preparation"
        message="Are you sure you want to delete this preparation? This will remove all associated vials."
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!confirmReleaseId}
        onClose={() => setConfirmReleaseId(null)}
        onConfirm={() => handleQcRelease(confirmReleaseId)}
        title="QC Release Preparation"
        message="Mark this preparation as QC released? This confirms it is approved for production use."
        confirmText={releasingPrepId ? 'Releasing...' : 'Release'}
        variant="primary"
      />
    </div>
  );
}
