'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  FlaskConical, Activity, SkipForward, RotateCcw,
  ChevronDown, Thermometer, Save
} from 'lucide-react';
import clsx from 'clsx';
import CreatorBadge from '@/components/ui/CreatorBadge';

// ── Constants ──────────────────────────────────────────────────────────────
const STERILITY_OPTIONS = ['', 'Pass', 'Fail', 'Pending'];
const SKIP_REASONS = [
  'Not required at this timepoint',
  'Instrument unavailable',
  'Sample unavailable',
  'Reagent unavailable',
  'Not performed — time constraint',
  'Other',
];

// ── Blank row factories ────────────────────────────────────────────────────
function blankBatchRow(flask) {
  return {
    flask_id:     flask.id,
    flask_label:  flask.flask_label,
    skipped:      false,
    skip_reason:  '',
    ph:           '',
    od:           '',
    sterility:    '',
    incubator_temp_c: '',
    plate_done:   false,
    colony_count: '',
    notes:        '',
  };
}

function blankStudyRow(tp) {
  return {
    time_point_id:    tp.id,
    log_hour:         tp.planned_hour,
    timepoint_label:  `T+${tp.planned_hour}h`,
    is_adhoc:         false,
    skipped:          false,
    skip_reason:      '',
    ph:               '',
    od:               '',
    sterility:        '',
    plate_done:       false,
    colony_count:     '',
    notes:            '',
  };
}

// Ad-hoc row: no formal time point — user sets the hour manually
function blankAdHocRow(hour = 0) {
  return {
    time_point_id:   null,
    log_hour:        hour,
    timepoint_label: '',
    is_adhoc:        true,
    skipped:         false,
    skip_reason:     '',
    ph:              '',
    od:              '',
    sterility:       '',
    plate_done:      false,
    colony_count:    '',
    notes:           '',
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
const CellCls = 'w-full px-2 py-1.5 text-sm font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400';

function rowHasData(row) {
  return row.ph !== '' || row.od !== '' || row.sterility !== '' || row.plate_done || row.notes !== '';
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function GridEntryPage() {
  const searchParams = useSearchParams();
  const { employeeProfile } = useAuth();

  const [sources, setSources]         = useState({ batches: [], growth_studies: [] });
  const [sourcesLoading, setSourcesLoading] = useState(true);

  const [sourceType, setSourceType]   = useState('batch');
  const [sourceId, setSourceId]       = useState('');
  const [logHour, setLogHour]         = useState('');
  const [collectedAt, setCollectedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [odWavelength, setOdWavelength] = useState(600);

  const [rows, setRows]               = useState([]);
  const [adHocMode, setAdHocMode]     = useState(false); // true when study has no formal time points
  const [mobileView, setMobileView]   = useState('table'); // 'table' | 'cards'
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [result, setResult]           = useState(null);

  // ── Load sources, then apply URL pre-fill ────────────────────
  // Deep-link format (from Active Queue "Grid" button):
  //   ?source_type=batch&source_id=OXY-B-26-001
  //   ?source_type=growth_study&source_id=uuid
  useEffect(() => {
    setSourcesLoading(true);
    fetch('/api/lab-bench/sources')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setSources(json);
          const paramType = searchParams.get('source_type');
          const paramSrc  = searchParams.get('source_id');
          if (paramType && paramSrc) {
            setSourceType(paramType);
            setSourceId(paramSrc);
          }
        }
      })
      .finally(() => setSourcesLoading(false));
  }, [searchParams]);

  // ── Rebuild rows when source changes ─────────────────────────
  const selectedBatch = sources.batches.find(
    b => b.batch_id === sourceId || b.id === sourceId
  );
  const selectedStudy = sources.growth_studies.find(s => s.id === sourceId);

  useEffect(() => {
    if (sourceType === 'batch' && selectedBatch) {
      setRows((selectedBatch.batch_flasks || []).map(blankBatchRow));
      setAdHocMode(false);
      setOdWavelength(600);
    } else if (sourceType === 'growth_study' && selectedStudy) {
      const pending = (selectedStudy.growth_study_time_points || [])
        .filter(tp => tp.status === 'pending')
        .sort((a, b) => a.planned_hour - b.planned_hour);

      if (pending.length > 0) {
        // Formal time point schedule exists
        setRows(pending.map(blankStudyRow));
        setAdHocMode(false);
      } else {
        // No formal time points — ad-hoc mode: start with one row at current elapsed time
        const inocTime = selectedStudy.inoculation_time;
        const elapsed = inocTime
          ? parseFloat(((Date.now() - new Date(inocTime).getTime()) / 3_600_000).toFixed(1))
          : 0;
        setRows([blankAdHocRow(elapsed)]);
        setAdHocMode(true);
      }
      setOdWavelength(selectedStudy.od_wavelength || 600);
    } else {
      setRows([]);
      setAdHocMode(false);
    }
  }, [sourceId, sourceType, selectedBatch, selectedStudy]);

  // ── Row update helpers ────────────────────────────────────────
  const updateRow = useCallback((idx, field, value) => {
    setRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }, []);

  const toggleSkip = useCallback((idx) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      return { ...row, skipped: !row.skipped, skip_reason: '' };
    }));
  }, []);

  // ── Derived counts ────────────────────────────────────────────
  const activeRows  = rows.filter(r => !r.skipped && rowHasData(r));
  const skippedRows = rows.filter(r => r.skipped);

  // ── Source label builder ──────────────────────────────────────
  function sourceLabel() {
    if (sourceType === 'batch' && selectedBatch) return `Batch ${selectedBatch.batch_id}`;
    if (sourceType === 'growth_study' && selectedStudy) {
      return selectedStudy.study_code
        ? `Growth Study ${selectedStudy.study_code}`
        : `Growth Study ${selectedStudy.name}`;
    }
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');

    if (!sourceId) { setError('Select a source first.'); return; }
    if (sourceType === 'batch' && (logHour === '' || isNaN(Number(logHour)))) {
      setError('Enter the log hour for this sampling round.'); return;
    }

    const hasAnyData = rows.some(r => r.skipped || rowHasData(r));
    if (!hasAnyData) { setError('Enter at least one value before saving.'); return; }

    // Validate skip reasons
    const missingSR = rows.find(r => r.skipped && !r.skip_reason);
    if (missingSR) {
      const label = missingSR.flask_label || missingSR.timepoint_label || 'a row';
      setError(`Select a skip reason for ${label}.`);
      return;
    }

    const payload = {
      source_type:  sourceType,
      source_id:    sourceType === 'batch' ? selectedBatch.batch_id : sourceId,
      source_label: sourceLabel(),
      log_hour:     sourceType === 'batch' ? Number(logHour) : null,
      collected_at: new Date(collectedAt).toISOString(),
      entries:      rows
        .filter(r => r.skipped || rowHasData(r))  // omit empty un-skipped rows
        .map(r => ({
          ...r,
          od_wavelength: odWavelength,
          // Always normalise log_hour to a number; batch uses the global field, study uses per-row
          log_hour: r.log_hour != null && r.log_hour !== ''
            ? Number(r.log_hour)
            : (sourceType === 'batch' ? Number(logHour) : null),
        })),
    };

    setSaving(true);
    try {
      const res  = await fetch('/api/lab-bench/grid', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Save failed.'); return; }
      setResult(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-slate-600" />
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Grid Saved</h2>
        <p className="text-slate-500 text-sm font-medium mb-4">
          {result.saved} reading{result.saved !== 1 ? 's' : ''} logged
          {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
        </p>

        {result.alarms?.length > 0 && (
          <div className="mx-auto max-w-xs mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left space-y-1">
            {result.alarms.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-red-700 text-sm font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {a.label} — {[a.ph && 'pH alarm', a.temp && 'Temp alarm'].filter(Boolean).join(', ')}
              </div>
            ))}
          </div>
        )}

        {result.results?.some(r => r.error) && (
          <div className="mx-auto max-w-xs mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left">
            <p className="text-amber-700 text-xs font-black uppercase tracking-wider mb-1">Partial errors</p>
            {result.results.filter(r => r.error).map((r, i) => (
              <p key={i} className="text-amber-700 text-xs font-medium">{r.label}: {r.error}</p>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setResult(null); setRows(rows.map(r => ({ ...r, ph: '', od: '', sterility: '', plate_done: false, colony_count: '', notes: '', skipped: false, skip_reason: '' }))); }}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-black rounded-xl text-sm"
          >
            New Grid
          </button>
          <Link href="/lab-bench" className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-sm">
            Lab Bench
          </Link>
        </div>
      </div>
    );
  }

  const isBatch = sourceType === 'batch';
  const isStudy = sourceType === 'growth_study';

  return (
    <div className="max-w-full px-4 py-6 pb-24 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link href="/lab-bench" className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Lab Bench</p>
          <h1 className="text-xl font-black text-slate-800">Grid Entry</h1>
        </div>
      </div>

      {/* ── Source + Config Bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">

        {/* Source type tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { value: 'batch',        label: 'Batch — Multi-flask',    icon: FlaskConical },
            { value: 'growth_study', label: 'Growth Study — Multi-timepoint', icon: Activity },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value} type="button"
              onClick={() => { setSourceType(value); setSourceId(''); setRows([]); }}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-black text-xs transition-all',
                sourceType === value
                  ? 'border-slate-600 bg-slate-50 text-slate-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              )}
            >
              <Icon className={clsx('w-4 h-4', sourceType === value ? 'text-slate-600' : 'text-slate-400')} />
              {label}
            </button>
          ))}
        </div>

        <div className={clsx('grid gap-3', isBatch ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3')}>
          {/* Source dropdown */}
          <div className={isBatch ? 'col-span-2 md:col-span-2' : 'md:col-span-1'}>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              {isBatch ? 'Batch' : 'Growth Study'}
            </label>
            {sourcesLoading ? (
              <div className="flex items-center gap-2 h-10 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <select
                className={CellCls + ' h-10'}
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
              >
                <option value="">Select…</option>
                {isBatch
                  ? sources.batches.map(b => (
                      <option key={b.id} value={b.batch_id}>{b.batch_id}</option>
                    ))
                  : sources.growth_studies.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.study_code ? `${s.study_code} — ` : ''}{s.name}
                      </option>
                    ))
                }
              </select>
            )}
          </div>

          {/* Log hour — batch only (GS uses per-row hours from time points) */}
          {isBatch && (
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                Log Hour (T+)
              </label>
              <div className="relative">
                <input
                  className={CellCls + ' h-10 pr-6'}
                  type="number" step="0.5" min="0"
                  placeholder="e.g. 24"
                  value={logHour}
                  onChange={e => setLogHour(e.target.value)}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">h</span>
              </div>
            </div>
          )}

          {/* OD wavelength */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              OD Wavelength
            </label>
            <div className="relative">
              <input
                className={CellCls + ' h-10 pr-8'}
                type="number" step="1"
                value={odWavelength}
                onChange={e => setOdWavelength(Number(e.target.value))}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">nm</span>
            </div>
          </div>

          {/* Logged at */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Logged At
            </label>
            <input
              className={CellCls + ' h-10'}
              type="datetime-local"
              value={collectedAt}
              onChange={e => setCollectedAt(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Ad-hoc mode banner ── */}
      {isStudy && adHocMode && rows.length > 0 && (
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <Activity className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-slate-700">No time point schedule — ad-hoc entry</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              This study has no formal time points. Enter measurements at any hour. The hour is editable per row.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const lastHour = rows.length > 0
                ? (Number(rows[rows.length - 1].log_hour) || 0) + 2
                : 0;
              setRows(prev => [...prev, blankAdHocRow(lastHour)]);
            }}
            className="shrink-0 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs font-black rounded-lg transition-colors"
          >
            + Add row
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {sourceId && rows.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <p className="font-bold text-sm">
            {isBatch ? 'No flasks found for this batch.' : 'No pending timepoints for this study.'}
          </p>
          <p className="text-xs mt-1">
            {isBatch ? 'Add flasks to the batch first.' : 'All timepoints may already be completed.'}
          </p>
        </div>
      )}

      {/* ── Grid Table ── */}
      {rows.length > 0 && (
        <>
        {/* Mobile view toggle */}
        <div className="flex md:hidden items-center gap-2 mb-3">
          <button
            onClick={() => setMobileView('table')}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all', mobileView === 'table' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-200')}
          >Table</button>
          <button
            onClick={() => setMobileView('cards')}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all', mobileView === 'cards' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-200')}
          >Cards</button>
        </div>

        <div className={clsx(mobileView === 'cards' ? 'hidden md:block' : '')}>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Column headers */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider w-20 sm:w-28 sticky left-0 bg-slate-50 z-10">
                    {isBatch ? 'Flask' : 'Timepoint'}
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-black text-slate-400 uppercase tracking-wider w-16">
                    Skip
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider w-24">
                    pH
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider w-24">
                    OD{odWavelength}
                  </th>
                  {isBatch && (
                    <th className="px-2 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider w-24">
                      Temp °C
                    </th>
                  )}
                  <th className="px-2 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider w-28">
                    Sterility
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-black text-slate-400 uppercase tracking-wider w-16">
                    Plate
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row, idx) => (
                  <GridRow
                    key={row.flask_id || row.time_point_id || idx}
                    row={row}
                    idx={idx}
                    isBatch={isBatch}
                    odWavelength={odWavelength}
                    updateRow={updateRow}
                    toggleSkip={toggleSkip}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer summary */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
              <span className="text-slate-700">{activeRows.length} with data</span>
              {skippedRows.length > 0 && (
                <span className="text-amber-600">{skippedRows.length} skipped</span>
              )}
              <span>{rows.length - activeRows.length - skippedRows.length} empty (will not be saved)</span>
            </div>
          </div>
        </div>
        </div>

        {/* Mobile cards view */}
        <div className={clsx('space-y-3 md:hidden', mobileView !== 'cards' && 'hidden')}>
          {rows.map((row, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-slate-800">{row.flask_label || row.timepoint_label || `Row ${i + 1}`}</span>
                {row.skipped && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-bold">Skipped</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                <div>
                  <label className="text-xs text-slate-400 font-bold uppercase block mb-1">pH</label>
                  <input type="number" step="0.01" value={row.ph} onChange={e => updateRow(i, 'ph', e.target.value)} disabled={row.skipped} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50" placeholder="—" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold uppercase block mb-1">OD</label>
                  <input type="number" step="0.001" value={row.od} onChange={e => updateRow(i, 'od', e.target.value)} disabled={row.skipped} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50" placeholder="—" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold uppercase block mb-1">Temp °C</label>
                  <input type="number" step="0.1" value={row.incubator_temp_c || ''} onChange={e => updateRow(i, 'incubator_temp_c', e.target.value)} disabled={row.skipped} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50" placeholder="—" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select value={row.sterility} onChange={e => updateRow(i, 'sterility', e.target.value)} disabled={row.skipped} className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none disabled:bg-slate-50">
                  {STERILITY_OPTIONS.map(o => <option key={o} value={o}>{o || 'Sterility...'}</option>)}
                </select>
                <button type="button" onClick={() => updateRow(i, 'skipped', !row.skipped)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all', row.skipped ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200')}>
                  {row.skipped ? 'Skipped' : 'Skip'}
                </button>
              </div>
              {row.skipped && (
                <select value={row.skip_reason} onChange={e => updateRow(i, 'skip_reason', e.target.value)} className="w-full mt-2 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none">
                  <option value="">Select reason...</option>
                  {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Submit ── */}
      {rows.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 font-medium">Logging as</span>
          <CreatorBadge initials={employeeProfile?.initials} fullName={employeeProfile?.full_name} />
        </div>
      )}
      {rows.length > 0 && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || (activeRows.length === 0 && skippedRows.length === 0)}
          className="w-full py-4 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-400 text-white font-black rounded-2xl text-base transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save {activeRows.length + skippedRows.length} row{activeRows.length + skippedRows.length !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}

    </div>
  );
}

// ── Grid Row component ─────────────────────────────────────────────────────
function GridRow({ row, idx, isBatch, odWavelength, updateRow, toggleSkip }) {
  const label = row.flask_label || row.timepoint_label || `Row ${idx + 1}`;
  const dim   = row.skipped;

  return (
    <>
      <tr className={clsx('transition-colors', dim ? 'bg-slate-50' : 'hover:bg-slate-50/40')}>
        {/* Label — editable hour for ad-hoc rows, static for scheduled rows */}
        <td className={clsx(
          'px-3 py-2 sticky left-0 z-10 transition-colors',
          dim ? 'bg-slate-50' : 'bg-white group-hover:bg-slate-50/40'
        )}>
          {row.is_adhoc ? (
            <div className="flex items-center gap-1">
              <span className="text-xs font-black text-slate-500">T+</span>
              <input
                type="number"
                step="0.5"
                min="0"
                disabled={dim}
                className="w-16 px-1.5 py-1 text-sm font-black text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
                value={row.log_hour}
                onChange={e => updateRow(idx, 'log_hour', e.target.value)}
              />
              <span className="text-xs font-bold text-slate-400">h</span>
            </div>
          ) : (
            <span className={clsx(
              'text-sm font-black',
              dim ? 'text-slate-400' : 'text-slate-700'
            )}>
              {label}
            </span>
          )}
        </td>

        {/* Skip toggle */}
        <td className="px-2 py-2 text-center">
          <button
            type="button"
            onClick={() => toggleSkip(idx)}
            title={dim ? 'Un-skip this row' : 'Skip this row'}
            className={clsx(
              'w-7 h-7 rounded-lg border flex items-center justify-center mx-auto transition-all',
              dim
                ? 'bg-amber-100 border-amber-300 text-amber-600 hover:bg-amber-200'
                : 'bg-white border-slate-200 text-slate-300 hover:border-amber-300 hover:text-amber-500 hover:bg-amber-50'
            )}
          >
            {dim
              ? <RotateCcw className="w-3.5 h-3.5" />
              : <SkipForward className="w-3.5 h-3.5" />
            }
          </button>
        </td>

        {/* pH */}
        <td className="px-2 py-2">
          <input
            className={CellCls}
            type="number" step="0.01" min="0" max="14"
            placeholder="pH"
            disabled={dim}
            value={row.ph}
            onChange={e => updateRow(idx, 'ph', e.target.value)}
          />
        </td>

        {/* OD */}
        <td className="px-2 py-2">
          <input
            className={CellCls}
            type="number" step="0.001" min="0"
            placeholder="OD"
            disabled={dim}
            value={row.od}
            onChange={e => updateRow(idx, 'od', e.target.value)}
          />
        </td>

        {/* Temp — batch only */}
        {isBatch && (
          <td className="px-2 py-2">
            <input
              className={CellCls}
              type="number" step="0.5"
              placeholder="°C"
              disabled={dim}
              value={row.incubator_temp_c}
              onChange={e => updateRow(idx, 'incubator_temp_c', e.target.value)}
            />
          </td>
        )}

        {/* Sterility */}
        <td className="px-2 py-2">
          <select
            className={CellCls}
            disabled={dim}
            value={row.sterility}
            onChange={e => updateRow(idx, 'sterility', e.target.value)}
          >
            {STERILITY_OPTIONS.map(o => (
              <option key={o} value={o}>{o || '—'}</option>
            ))}
          </select>
        </td>

        {/* Plate toggle */}
        <td className="px-2 py-2 text-center">
          <button
            type="button"
            disabled={dim}
            onClick={() => updateRow(idx, 'plate_done', !row.plate_done)}
            className={clsx(
              'w-7 h-7 rounded-lg border flex items-center justify-center mx-auto transition-all text-xs font-black',
              row.plate_done && !dim
                ? 'bg-red-100 border-red-300 text-red-600'
                : 'bg-white border-slate-200 text-slate-300 hover:border-red-200 hover:bg-red-50'
            )}
            title={row.plate_done ? 'Plate taken' : 'Mark plate taken'}
          >
            {row.plate_done ? '✓' : '+'}
          </button>
        </td>

        {/* Notes */}
        <td className="px-2 py-2">
          <input
            className={CellCls}
            type="text"
            placeholder="notes…"
            disabled={dim}
            value={row.notes}
            onChange={e => updateRow(idx, 'notes', e.target.value)}
          />
        </td>
      </tr>

      {/* Skip reason row — expands inline when skipped */}
      {dim && (
        <tr className="bg-amber-50/60">
          <td colSpan={isBatch ? 8 : 7} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-600 uppercase tracking-wider whitespace-nowrap">
                Skip reason
              </span>
              <select
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-medium text-amber-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={row.skip_reason}
                onChange={e => updateRow(idx, 'skip_reason', e.target.value)}
              >
                <option value="">Select reason (required for GMP record)…</option>
                {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
