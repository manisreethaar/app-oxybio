'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Plus, Trash2, GripVertical, Save, FlaskConical, Tag, Megaphone, Loader2 } from 'lucide-react';

function SystemBroadcastPanel() {
  const [title, setTitle] = useState('System Updates');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [commits, setCommits] = useState([]);
  const toast = useToast();

  useEffect(() => {
    async function fetchCommits() {
      try {
        const res = await fetch('https://api.github.com/repos/manisreethaar/app-oxybio/commits?per_page=10');
        if (!res.ok) throw new Error('Failed to fetch commits');
        const data = await res.json();
        
        // Clean commit messages: remove "feat:", "fix:", "chore:" etc.
        const parsed = data.map(c => {
          let msg = c.commit.message.split('\n')[0]; // take first line
          msg = msg.replace(/^(feat|fix|chore|refactor|docs|style|test)(\(.*?\))?:\s*/i, '');
          msg = msg.charAt(0).toUpperCase() + msg.slice(1);
          return {
            sha: c.sha,
            message: msg,
            selected: false,
            date: new Date(c.commit.author.date).toLocaleString()
          };
        });
        
        // Filter out auto-generated or unhelpful ones if needed, but let's keep all for now
        setCommits(parsed);
      } catch (err) {
        console.error(err);
      } finally {
        setFetching(false);
      }
    }
    fetchCommits();
  }, []);

  const toggleCommit = (sha) => {
    setCommits(prev => {
      const updated = prev.map(c => c.sha === sha ? { ...c, selected: !c.selected } : c);
      
      // Auto-generate message based on selected
      const selectedMsgs = updated.filter(c => c.selected).map(c => `• ${c.message}`);
      if (selectedMsgs.length > 0) {
        setMessage(`🚀 New System Updates:\n\n${selectedMsgs.join('\n')}`);
      } else {
        setMessage('');
      }
      
      return updated;
    });
  };

  const handleBroadcast = async () => {
    if (!title.trim() || !message.trim()) {
      toast.warn('Please provide a title and message.');
      return;
    }
    
    if (!window.confirm('Are you sure you want to broadcast this to ALL users?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, type: 'info' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send broadcast');
      
      toast.success('Broadcast sent successfully!');
      setTitle('System Updates');
      setMessage('');
      setCommits(prev => prev.map(c => ({ ...c, selected: false })));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5 space-y-4 border-emerald-200 bg-emerald-50/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-black text-emerald-900">System Broadcast</p>
            <p className="text-xs text-emerald-700/70">Send an instant notification (and web-push) to all active employees.</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3 border-r md:border-slate-200 md:pr-4">
          <p className="text-xs font-black text-slate-500 uppercase">1. Select Recent Updates</p>
          {fetching ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Fetching latest pushes from GitHub...
            </div>
          ) : commits.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No recent updates found.</p>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
              {commits.map(c => (
                <label key={c.sha} className={`flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition-colors ${c.selected ? 'bg-emerald-100/50 border-emerald-300' : 'bg-white border-slate-200 hover:border-emerald-300'}`}>
                  <input 
                    type="checkbox" 
                    className="mt-0.5" 
                    checked={c.selected}
                    onChange={() => toggleCommit(c.sha)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 break-words leading-snug">{c.message}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{c.date}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-black text-slate-500 uppercase">2. Review & Send</p>
          <input 
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Broadcast Title (e.g., New Feature Released)"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <textarea 
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Message content..."
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[140px] resize-y font-mono text-slate-700"
          />
          <button 
            onClick={handleBroadcast}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {loading ? 'Sending...' : 'Send Broadcast to All Users'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-navy/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-navy" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">{title}</p>
            <p className="text-xs text-slate-400">{description}</p>
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
          <div key={item.value} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span className="font-mono text-xs font-black text-navy bg-navy/10 px-2 py-0.5 rounded shrink-0 min-w-[56px] text-center">
              {item.value}
            </span>
            <input
              value={item.label}
              onChange={e => handleLabelEdit(item.value, e.target.value)}
              className="flex-1 text-xs font-semibold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-navy focus:outline-none py-0.5 transition-colors"
            />
            <button
              onClick={() => handleDelete(item.value)}
              className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add new option */}
      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <input
          value={newValue}
          onChange={e => setNewValue(e.target.value.toUpperCase())}
          placeholder="Code (e.g. F3)"
          maxLength={10}
          className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-navy/20"
        />
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Label shown in dropdown (e.g. F3 — New type)"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-navy/20"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Press <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-500 text-xs">Enter</kbd> in the label field or click Add. Edit labels inline. Click Save Changes when done.
      </p>
    </div>
  );
}

export default function BatchSettingsPage() {
  const toast = useToast();
  const [experimentTypes, setExperimentTypes] = useState([]);
  const [skuTargets, setSkuTargets] = useState([]);
  const [documentCategories, setDocumentCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    withTimeout(fetch('/api/admin/batch-options'), 20000, 'Settings load timed out')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setExperimentTypes(json.data.experiment_types || []);
          setSkuTargets(json.data.sku_targets || []);
          setDocumentCategories(json.data.document_categories || []);
        }
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [toast]);

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
      else if (key === 'sku_targets') setSkuTargets(json.data);
      else if (key === 'document_categories') setDocumentCategories(json.data);
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
        <h1 className="text-xl font-black text-slate-900">Admin Settings & Broadcasts</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage system configurations, dropdown options, and send announcements to all users.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-40 mb-3" />
              <div className="space-y-2">
                {[1, 2, 3].map(j => <div key={j} className="h-9 bg-slate-100 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <SystemBroadcastPanel />

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
          <OptionsEditor
            title="Document Categories"
            description="Shown in the Category dropdown when uploading SOPs and Documents."
            icon={Tag}
            optionKey="document_categories"
            options={documentCategories}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}
