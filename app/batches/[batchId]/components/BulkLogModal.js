'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { X, CheckCircle2 } from 'lucide-react';

export default function BulkLogModal({
  flasks,
  batchId,
  stageId,
  stageType,
  employeeProfile,
  standardCurve,
  onClose,
  onSave
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // Initialize a row of state for each flask
  const [readings, setReadings] = useState(
    flasks.reduce((acc, f) => {
      acc[f.id] = {
        elapsed_hours: '',
        ph: '',
        optical_density: '',
        is_blank: false,
        anthrone_od: '',
        gram_staining: '',
        microscopic_test: '',
        dilution_factor: ''
      };
      return acc;
    }, {})
  );

  const updateReading = (flaskId, field, value) => {
    setReadings(prev => ({
      ...prev,
      [flaskId]: {
        ...prev[flaskId],
        [field]: value
      }
    }));
  };

  const copyDownElapsedHours = (flaskId) => {
    const value = readings[flaskId].elapsed_hours;
    if (value === '') return;
    setReadings(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = { ...next[key], elapsed_hours: value };
      });
      return next;
    });
    toast.info('Copied elapsed hours to all flasks');
  };

  const handleSubmit = async () => {
    if (!employeeProfile?.id) {
      toast.error('You must be logged in as an employee to log readings.');
      return;
    }

    // Build the payload
    const payloads = [];
    
    for (const f of flasks) {
      const r = readings[f.id];
      // Only include rows where at least one metric is provided
      if (r.ph || r.optical_density || r.gram_staining || r.microscopic_test || r.anthrone_od) {
        
        let anthroneConc = null;
        if (stageType === 'production' && r.anthrone_od && standardCurve) {
          const od = parseFloat(r.anthrone_od);
          const c = parseFloat(standardCurve.equation_c);
          const m = parseFloat(standardCurve.equation_m);
          if (m !== 0) anthroneConc = (od - c) / m;
        }

        payloads.push({
          batch_id: batchId,
          seed_train_id: stageId,
          flask_id: f.id,
          elapsed_hours: r.elapsed_hours ? parseFloat(r.elapsed_hours) : null,
          ph: r.ph ? parseFloat(r.ph) : null,
          optical_density: r.optical_density ? parseFloat(r.optical_density) : null,
          is_blank: r.is_blank,
          gram_staining: r.gram_staining || null,
          microscopic_test: r.microscopic_test || null,
          dilution_factor: r.dilution_factor ? parseFloat(r.dilution_factor) : null,
          anthrone_od: r.anthrone_od ? parseFloat(r.anthrone_od) : null,
          anthrone_conc: anthroneConc,
          standard_curve_id: standardCurve?.id || null,
          logged_by: employeeProfile.id,
          logged_by_name: employeeProfile.full_name || null,
          logged_by_role: employeeProfile.role || null,
        });
      }
    }

    if (payloads.length === 0) {
      toast.error('No data entered to log.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/seed-trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_log_readings',
          payloads
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to bulk log readings');
      
      toast.success(`Successfully logged ${payloads.length} readings!`);
      onSave();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-xl font-black text-slate-900">Bulk Log Samples</h3>
            <p className="text-sm text-slate-500 font-semibold">{stageType.toUpperCase().replace('_', ' ')} — {flasks.length} Flasks</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Content - Scrollable Table */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-600 uppercase tracking-wider">
                  <th className="p-3">Flask</th>
                  <th className="p-3 w-32">Elapsed Hr</th>
                  <th className="p-3 w-24">pH</th>
                  <th className="p-3 w-28">OD 600nm</th>
                  {stageType === 'production' && <th className="p-3 w-28">Anthrone OD</th>}
                  <th className="p-3 w-24">Dilution</th>
                  <th className="p-3 min-w-[140px]">Gram Staining</th>
                  <th className="p-3 min-w-[140px]">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flasks.map((f, idx) => {
                  const r = readings[f.id];
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-black text-sm text-slate-800 border-r border-slate-50">{f.flask_label}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.5" value={r.elapsed_hours} onChange={e => updateReading(f.id, 'elapsed_hours', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="e.g. 24"/>
                          {idx === 0 && (
                            <button onClick={() => copyDownElapsedHours(f.id)} title="Apply to all below" className="p-1.5 text-navy hover:bg-navy/10 rounded">↓</button>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <input type="number" step="0.01" value={r.ph} onChange={e => updateReading(f.id, 'ph', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"/>
                      </td>
                      <td className="p-2">
                        <input type="number" step="0.001" value={r.optical_density} onChange={e => updateReading(f.id, 'optical_density', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"/>
                      </td>
                      {stageType === 'production' && (
                        <td className="p-2">
                          <input type="number" step="0.001" value={r.anthrone_od} onChange={e => updateReading(f.id, 'anthrone_od', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"/>
                        </td>
                      )}
                      <td className="p-2">
                        <input type="number" step="1" value={r.dilution_factor} onChange={e => updateReading(f.id, 'dilution_factor', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"/>
                      </td>
                      <td className="p-2">
                        <select value={r.gram_staining} onChange={e => updateReading(f.id, 'gram_staining', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                          <option value="">-</option>
                          <option value="Gram Positive">Positive (+)</option>
                          <option value="Gram Negative">Negative (−)</option>
                          <option value="Mixed">Mixed</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input type="text" value={r.microscopic_test} onChange={e => updateReading(f.id, 'microscopic_test', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Notes..."/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-white rounded-b-2xl flex justify-between items-center">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-black">
              {employeeProfile?.full_name?.[0] || '?'}
            </div>
            <span className="text-xs font-bold text-slate-700">{employeeProfile?.full_name || 'Unknown'} (ALOCA++)</span>
          </div>
          
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving || !employeeProfile?.id} className="px-8 py-2.5 bg-navy text-white rounded-xl text-sm font-black flex items-center gap-2 hover:bg-navy-hover transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : <><CheckCircle2 className="w-4 h-4"/> Save All Readings</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
