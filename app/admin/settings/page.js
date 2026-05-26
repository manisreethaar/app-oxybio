'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { Plus, Trash2, GripVertical, Save, FlaskConical, Tag } from 'lucide-react';

function OptionsEditor({ title, description, icon: Icon, optionKey, options, onSave, saving }) {
  const [items, setItems] = useState(options);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [dirty, setDirty] = useState(false);
  const toast = useToast();

  // Sync when parent options change (initial load)
  useEffect(() => { setItems(options); setDirty(false); }, [options]);

  const handleAdd = () => {
    const val = newValue.trim().toUpperCase().replace(/\s+/g, '_');
    const lbl = newLabel.trim();
    if (!val || !lbl) { toast.warn('Fill in both a code and a label.'); return; }
    if (items.some(i => i.value === val)) { toast.warn(`"${val}" already exists.`); return; }
    setItems(prev => [...prev, { value: val, label: lbl }]);
    setNewValue(''); setNewLabel(''); setDirty(true);
  };

  const handleDelete = (value) => {
    setItems(prev => prev.filter(i => i.value !== value));
    setDirty(true);
  };

  const handleLabelEdit = (value, newLbl) => {
    setItems(prev => prev.map(i => i.value === value ? { ...i, label: newLbl } : i));
    setDirty(true);
  };

  return (
    <div className="surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-navy/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-navy" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-900">{title}</p>
            <p className="text-[11px] text-gray-400">{description}</p>
          </div>
        </div>
        {dirty && (
          <button
            onClick={() => onSave(optionKey, items)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white text-xs font-bold rounded-lg hover:bg-navy/90 disabled:opacity-50 shrink-0"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Existing options */}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.value} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
            <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            <span className="font-mono text-xs font-black text-navy bg-navy/10 px-2 py-0.5 rounded shrink-0 min-w-[56px] text-center">
              {item.value}
            </span>
            <input
              value={item.label}
              onChange={e => handleLabelEdit(item.value, e.target.value)}
              className="flex-1 text-xs font-semibold text-gray-700 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-navy focus:outline-none py-0.5 transition-colors"
            />
            <button
              onClick={() => handleDelete(item.value)}
              className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add new option */}
      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <input
          value={newValue}
          onChange={e => setNewValue(e.target.value.toUpperCase())}
          placeholder="Code (e.g. F3)"
          maxLength={10}
          className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-navy/20"
        />
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Label shown in dropdown (e.g. F3 — New type)"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-navy/20"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        Press <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500 text-[9px]">Enter</kbd> in the label field or click Add. Edit labels inline. Click Save Changes when done.
      </p>
    </div>
  );
}

export default function BatchSettingsPage() {
  const toast = useToast();
  const [experimentTypes, setExperimentTypes] = useState([]);
  const [skuTargets, setSkuTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/batch-options')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setExperimentTypes(json.data.experiment_types || []);
          setSkuTargets(json.data.sku_targets || []);
        }
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key, options) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/batch-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, options }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (key === 'experiment_types') setExperimentTypes(json.data);
      else setSkuTargets(json.data);
      toast.success('Saved successfully.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-black text-gray-900">Batch Settings</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Manage the dropdown options that appear when creating a new batch. Changes take effect immediately for all users.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="surface p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-40 mb-3" />
              <div className="space-y-2">
                {[1, 2, 3].map(j => <div key={j} className="h-9 bg-gray-100 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <OptionsEditor
            title="Experiment Types"
            description="Shown in the Experiment Type dropdown when creating a new batch."
            icon={FlaskConical}
            optionKey="experiment_types"
            options={experimentTypes}
            onSave={handleSave}
            saving={saving}
          />
          <OptionsEditor
            title="SKU Targets"
            description="Shown in the SKU Target dropdown when creating a new batch."
            icon={Tag}
            optionKey="sku_targets"
            options={skuTargets}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}
