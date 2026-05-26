'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Plus, FlaskConical, Dna, Layers, ChevronRight, Search, Trash2, ExternalLink } from 'lucide-react';
import Skeleton from '@/components/Skeleton';

const STATUS_COLOR = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Discarded':   'bg-red-100 text-red-600',
};

const SOURCE_COLOR = {
  MTCC:     'bg-indigo-100 text-indigo-700',
  NCIM:     'bg-purple-100 text-purple-700',
  Isolated: 'bg-teal-100 text-teal-700',
  Other:    'bg-gray-100 text-gray-600',
};

function StrainForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', source_type: 'MTCC', accession_number: '', strain_short_code: '', isolation_source: '', received_date: '', taxonomy: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/research/cell-bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'strain', ...form }) });
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
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="field-label">Strain Name / Organism <span className="text-red-500">*</span></label>
          <input required value={form.name} onChange={e => set('name', e.target.value)} className="field-input" placeholder="e.g. Lactobacillus brevis MTCC 1408"/></div>
        <div><label className="field-label">Source</label>
          <select value={form.source_type} onChange={e => set('source_type', e.target.value)} className="field-input bg-white">
            {['MTCC','NCIM','Isolated','Other'].map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="field-label">Accession / Lot #</label>
          <input value={form.accession_number} onChange={e => set('accession_number', e.target.value)} className="field-input" placeholder="MTCC-1408"/></div>
        <div>
          <label className="field-label">Strain Short Code <span className="text-red-500">*</span></label>
          <input required maxLength={4} value={form.strain_short_code} onChange={e => set('strain_short_code', e.target.value.toUpperCase())} className="field-input font-mono" placeholder="LB"/>
          <p className="text-[9px] text-gray-400 mt-0.5">2–4 letters used in vial codes e.g. <strong>MCB-26-LB-001</strong></p>
        </div>
        <div><label className="field-label">Isolation Source</label>
          <input value={form.isolation_source} onChange={e => set('isolation_source', e.target.value)} className="field-input" placeholder="Fermented rice"/></div>
        <div><label className="field-label">Date Received</label>
          <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className="field-input"/></div>
        <div className="col-span-2"><label className="field-label">Taxonomy</label>
          <input value={form.taxonomy} onChange={e => set('taxonomy', e.target.value)} className="field-input" placeholder="Firmicutes > Lactobacillales > Lactobacillaceae"/></div>
        <div className="col-span-2"><label className="field-label">Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving || !form.strain_short_code} className="flex-1 py-2 bg-navy text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Saving...' : 'Register Strain'}</button>
      </div>
    </form>
  );
}

function NewPrepForm({ strains, onSave, onCancel }) {
  const [form, setForm] = useState({ strain_id: strains[0]?.id || '', type: 'MCB', passage_number: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/research/cell-bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Preparation started.');
      onSave(json.data);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="surface p-5 space-y-4">
      <p className="text-sm font-bold text-gray-900">Start New Cell Bank Preparation</p>
      <p className="text-xs text-gray-500">Prep code auto-generated: <span className="font-mono font-bold">OB-CB-{new Date().getFullYear()}-NNN</span></p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="field-label">Strain <span className="text-red-500">*</span></label>
          <select required value={form.strain_id} onChange={e => set('strain_id', e.target.value)} className="field-input bg-white">
            <option value="">Select strain...</option>
            {strains.map(s => <option key={s.id} value={s.id}>{s.name} ({s.source_type}{s.accession_number ? ' ' + s.accession_number : ''})</option>)}
          </select></div>
        <div><label className="field-label">Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} className="field-input bg-white">
            <option value="MCB">MCB — Master Cell Bank</option>
            <option value="WCB">WCB — Working Cell Bank</option>
            <option value="RCB">RCB — Research Cell Bank</option>
          </select></div>
        <div><label className="field-label">Passage #</label>
          <input type="number" min="0" value={form.passage_number} onChange={e => set('passage_number', e.target.value)} className="field-input" placeholder="0"/></div>
        <div><label className="field-label">Notes</label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} className="field-input"/></div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving || !form.strain_id} className="flex-1 py-2 bg-navy text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Creating...' : 'Start Preparation'}</button>
      </div>
    </form>
  );
}

export default function CellBankPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('preparations');
  const [strains, setStrains] = useState([]);
  const [preps, setPreps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStrainForm, setShowStrainForm] = useState(false);
  const [showPrepForm, setShowPrepForm] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/research/cell-bank?view=strains'),
        fetch('/api/research/cell-bank?view=preparations'),
      ]);
      const [sJson, pJson] = await Promise.all([sRes.json(), pRes.json()]);
      if (sJson.success) setStrains(sJson.data || []);
      if (pJson.success) setPreps(pJson.data || []);
    } catch (err) { toast.error('Failed to load cell bank data'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredPreps = preps.filter(p => {
    const matchType = typeFilter === 'all' || p.type === typeFilter;
    const matchSearch = !search || p.prep_code?.toLowerCase().includes(search.toLowerCase()) || p.cell_bank_strains?.name?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const filteredStrains = strains.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.accession_number?.toLowerCase().includes(search.toLowerCase()));

  const handleDeleteStrain = async (id) => {
    if (!confirm('Delete this strain? All linked preparations will also be removed.')) return;
    const res = await fetch(`/api/research/cell-bank/${id}?target=strain`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Strain deleted.'); fetchAll(); }
    else toast.error(json.error);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900">Cell Bank</h1>
          <p className="text-xs text-gray-500 mt-0.5">Master Cell Bank (MCB) and Working Cell Bank (WCB) management</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button onClick={() => { setShowStrainForm(v => !v); setShowPrepForm(false); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm">
                <Dna className="w-3.5 h-3.5"/> Add Strain
              </button>
              <button onClick={() => { setShowPrepForm(v => !v); setShowStrainForm(false); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-navy text-white rounded-xl text-xs font-bold shadow-sm hover:bg-navy/90">
                <Plus className="w-3.5 h-3.5"/> New Preparation
              </button>
            </>
          )}
        </div>
      </div>

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
      {showStrainForm && <StrainForm onSave={(d) => { setStrains(v => [d, ...v]); setShowStrainForm(false); }} onCancel={() => setShowStrainForm(false)}/>}
      {showPrepForm && <NewPrepForm strains={strains} onSave={() => { fetchAll(); setShowPrepForm(false); }} onCancel={() => setShowPrepForm(false)}/>}

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
            {filteredPreps.map(p => (
              <Link key={p.id} href={`/research/cell-bank/${p.id}`}
                className="surface p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${p.type === 'MCB' ? 'bg-emerald-100 text-emerald-700' : p.type === 'RCB' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                  {p.type}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-gray-900">{p.prep_code}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    {p.passage_number != null && <span className="text-[10px] font-bold text-gray-400">P{p.passage_number}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{p.cell_bank_strains?.name}</p>
                  {p.type === 'WCB' && p.parent && <p className="text-[10px] text-gray-400 font-semibold">from MCB: {p.parent.prep_code}</p>}
                </div>
                <div className="text-right shrink-0">
                  {p.vial_count > 0 && <p className="text-xs font-black text-gray-700">{p.vial_count} vials</p>}
                  <p className="text-[10px] text-gray-400">{new Date(p.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0"/>
              </Link>
            ))}
          </div>
        )
      ) : (
        filteredStrains.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No strains registered. Use "Add Strain" to register one.</div>
        ) : (
          <div className="space-y-2">
            {filteredStrains.map(s => (
              <div key={s.id} className="surface p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
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
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-[10px] text-gray-400">{s.received_date ? new Date(s.received_date).toLocaleDateString('en-IN') : '—'}</p>
                  <button onClick={() => { setTab('preparations'); setShowPrepForm(true); }}
                    className="text-[10px] text-navy font-bold hover:underline flex items-center gap-1 ml-auto">
                    <Plus className="w-3 h-3"/> New Prep
                  </button>
                  {isAdmin && <button onClick={() => handleDeleteStrain(s.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
