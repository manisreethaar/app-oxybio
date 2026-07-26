'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Printer, ArrowLeft, FlaskConical } from 'lucide-react';

const GrowthCurveChart = dynamic(() => import('@/components/charts/GrowthCurveChart'), { ssr: false });

// ── Growth analysis calculations ─────────────────────────────────────────────
function calcGrowthParams(measurements) {
  const pts = measurements
    .filter(m => m.od_value > 0)
    .map(m => ({ t: parseFloat(m.actual_hour), od: parseFloat(m.od_value), lnOd: Math.log(parseFloat(m.od_value)) }))
    .sort((a, b) => a.t - b.t);

  if (pts.length < 3) return null;

  let muMax = 0, logStart = null, logEnd = null;
  for (let i = 0; i < pts.length - 2; i++) {
    const p1 = pts[i], p3 = pts[i + 2];
    if (p3.t === p1.t) continue;
    const mu = (p3.lnOd - p1.lnOd) / (p3.t - p1.t);
    if (mu > muMax) { muMax = mu; logStart = p1.t; logEnd = p3.t; }
  }

  const doublingTime = muMax > 0 ? (Math.log(2) / muMax) : null;

  // Lag phase: initial period before OD consistently increases
  let lagEnd = pts[0]?.t ?? 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i + 1].od > pts[i].od * 1.05) { lagEnd = pts[i].t; break; }
  }

  return { muMax: muMax.toFixed(4), doublingTime: doublingTime?.toFixed(2) ?? '—', logStart, logEnd, lagEnd };
}

function Section({ title, children }) {
  return (
    <section className="mb-10 print:mb-8">
      <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-4 print:text-base">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-sm py-1">
      <span className="font-black text-slate-500 w-44 shrink-0">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}

export default function GrowthStudyReportPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/growth-studies/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const growthParams = useMemo(() => data?.measurements?.length ? calcGrowthParams(data.measurements) : null, [data]);

  if (loading) return <div className="p-8 text-center text-slate-500">Generating report…</div>;
  if (!data?.study) return <div className="p-8 text-center text-red-500">Study not found.</div>;

  const { study, time_points, measurements, plate_observations } = data;
  const isFermentation = study.study_type === 'fermentation';
  const isolateName = study.cell_bank_strains?.name || study.cell_bank_preparations?.prep_code || 'Unknown isolate';
  const mediaName = study.formulations?.name || study.media_name || 'Unknown media';
  const duration = study.inoculation_time && study.completed_at
    ? ((new Date(study.completed_at) - new Date(study.inoculation_time)) / 3600000).toFixed(1)
    : study.expected_duration_hours;

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Screen-only toolbar */}
      <div className="print:hidden flex items-center justify-between mb-8 gap-4">
        <Link href={`/growth-studies/${id}`} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back to Study
        </Link>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-2xl text-sm"
        >
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      {/* Report header */}
      <div className="mb-10 border-b-2 border-slate-800 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="w-7 h-7 text-teal-600 print:hidden" />
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">OxyOS Research Module</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 print:text-2xl">{study.name}</h1>
        <p className="text-slate-500 font-medium mt-1">{isFermentation ? 'Fermentation Monitoring Report' : 'Growth Curve Analysis Report'}</p>
        <p className="text-xs text-slate-400 mt-2">Generated: {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
      </div>

      {/* 1. Study Details */}
      <Section title="1. Study Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Study Name" value={study.name} />
            <InfoRow label="Study Type" value={isFermentation ? 'Fermentation Monitoring' : 'Growth Curve'} />
            <InfoRow label="Status" value={study.status.toUpperCase()} />
            <InfoRow label="Isolate" value={isolateName} />
            <InfoRow label="Growth Media" value={mediaName} />
            <InfoRow label="Objective" value={study.objective} />
          </div>
          <div>
            <InfoRow label="Inoculation Time" value={study.inoculation_time ? new Date(study.inoculation_time).toLocaleString('en-IN') : '—'} />
            <InfoRow label="Total Duration (h)" value={duration} />
            <InfoRow label="Time Points Completed" value={`${time_points.filter(t => t.status === 'completed').length} / ${time_points.length}`} />
            <InfoRow label="Measurements Recorded" value={measurements.length} />
          </div>
        </div>
      </Section>

      {/* 2. Incubation Parameters */}
      <Section title="2. Incubation Parameters">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Vessel Type" value={study.vessel_type?.replace(/_/g, ' ')} />
            <InfoRow label="Working Volume (mL)" value={study.volume_ml} />
            <InfoRow label="Temperature (°C)" value={study.temperature_c} />
            <InfoRow label="Agitation (rpm)" value={study.agitation_rpm} />
          </div>
          <div>
            <InfoRow label="Inoculum (%v/v)" value={study.inoculum_percentage} />
            <InfoRow label="Inoculum Volume (mL)" value={study.inoculum_volume_ml} />
            <InfoRow label="OD Wavelength (nm)" value={study.od_wavelength || 600} />
            <InfoRow label="Initial OD" value={study.initial_od} />
            <InfoRow label="Initial pH" value={study.initial_ph} />
            {study.initial_glucose_g_l && <InfoRow label="Initial Glucose (g/L)" value={study.initial_glucose_g_l} />}
          </div>
        </div>
        {study.notes && <p className="text-sm text-slate-600 mt-4 bg-slate-50 p-3 rounded-xl italic">{study.notes}</p>}
      </Section>

      {/* 3. Growth Curve Chart */}
      <Section title="3. Growth Curve">
        <div className="bg-white border border-slate-100 rounded-2xl p-4" style={{ height: 340 }}>
          <GrowthCurveChart
            data={measurements}
            wavelength={study.od_wavelength || 600}
            showLines={['od', 'ph', 'glucose']}
            logScale={false}
          />
        </div>
        {measurements.some(m => m.od_value) && (
          <div className="mt-3 bg-slate-50 rounded-xl p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-sm">
              <InfoRow label="Max OD recorded" value={Math.max(...measurements.filter(m => m.od_value).map(m => parseFloat(m.od_value))).toFixed(4)} />
              <InfoRow label="Min pH recorded" value={measurements.filter(m => m.ph_value).length ? Math.min(...measurements.filter(m => m.ph_value).map(m => parseFloat(m.ph_value))).toFixed(2) : '—'} />
            </div>
          </div>
        )}
      </Section>

      {/* 4. Growth Kinetics */}
      {growthParams && (
        <Section title="4. Growth Kinetics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'µmax (h⁻¹)', value: growthParams.muMax },
              { label: 'Doubling Time (h)', value: growthParams.doublingTime },
              { label: 'Lag Phase End (h)', value: growthParams.lagEnd != null ? `T+${growthParams.lagEnd}h` : '—' },
              { label: 'Log Phase', value: growthParams.logStart != null ? `T+${growthParams.logStart}h → T+${growthParams.logEnd}h` : '—' },
            ].map(k => (
              <div key={k.label} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                <p className="text-xl font-black text-teal-700">{k.value}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">{k.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 italic">µmax calculated using maximum slope of ln(OD) vs. time over a 3-point sliding window.</p>
        </Section>
      )}

      {/* 5. Measurement Data */}
      <Section title="5. Raw Measurement Data">
        {measurements.length === 0 ? (
          <p className="text-slate-400 text-sm">No measurements recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {['Time (h)', `OD${study.od_wavelength || 600}`, 'pH', 'Temp (°C)', 'Glucose (g/L)', 'Protein (mg/mL)', ...(isFermentation ? ['DO (%)'] : []), 'Turbidity', 'Notes'].map(h => (
                    <th key={h} className="border border-slate-200 px-3 py-2 text-left font-black text-slate-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {measurements.map((m, i) => (
                  <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="border border-slate-100 px-3 py-1.5 font-black text-teal-700">T+{m.actual_hour}h</td>
                    <td className="border border-slate-100 px-3 py-1.5">{m.od_value ?? '—'}</td>
                    <td className="border border-slate-100 px-3 py-1.5">{m.ph_value ?? '—'}</td>
                    <td className="border border-slate-100 px-3 py-1.5">{m.temperature_actual_c ?? '—'}</td>
                    <td className="border border-slate-100 px-3 py-1.5">{m.glucose_g_l ?? '—'}</td>
                    <td className="border border-slate-100 px-3 py-1.5">{m.protein_mg_ml ?? '—'}</td>
                    {isFermentation && <td className="border border-slate-100 px-3 py-1.5">{m.dissolved_oxygen_pct ?? '—'}</td>}
                    <td className="border border-slate-100 px-3 py-1.5">{m.culture_turbidity?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="border border-slate-100 px-3 py-1.5 max-w-[120px] truncate">{m.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 6. Plate Observations */}
      {plate_observations.length > 0 && (
        <Section title="6. Plate Observations &amp; Sterility">
          <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {['Time (h)', 'Type', 'Media', 'Dilution', 'Colony Count', 'Morphology', 'Result', 'Notes'].map(h => (
                  <th key={h} className="border border-slate-200 px-3 py-2 text-left font-black text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plate_observations.map((obs, i) => (
                <tr key={obs.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="border border-slate-100 px-3 py-1.5 font-black text-violet-700">T+{obs.time_point_hours}h</td>
                  <td className="border border-slate-100 px-3 py-1.5">{obs.observation_type === 'sterility' ? 'Sterility' : 'Colony Count'}</td>
                  <td className="border border-slate-100 px-3 py-1.5">{obs.plate_media ?? '—'}</td>
                  <td className="border border-slate-100 px-3 py-1.5">{obs.dilution ?? '—'}</td>
                  <td className="border border-slate-100 px-3 py-1.5">{obs.colony_count ?? '—'}</td>
                  <td className="border border-slate-100 px-3 py-1.5 max-w-[140px]">{obs.colony_morphology ?? '—'}</td>
                  <td className="border border-slate-100 px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${obs.result === 'sterile' ? 'bg-emerald-100 text-emerald-700' : obs.result === 'contaminated' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>
                      {obs.result ?? 'pending'}
                    </span>
                  </td>
                  <td className="border border-slate-100 px-3 py-1.5">{obs.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Section>
      )}

      {/* 7. Summary & Conclusion */}
      <Section title={`${plate_observations.length > 0 ? '7' : '6'}. Summary & Conclusion`}>
        <div className="bg-slate-50 rounded-2xl p-5 space-y-2 text-sm text-slate-700 print:bg-white print:border print:border-slate-200">
          <p>Isolate <strong>{isolateName}</strong> was inoculated into <strong>{mediaName}</strong> at {study.inoculum_percentage ?? '—'}% (v/v) and incubated at {study.temperature_c ?? '—'}°C for {duration}h.</p>
          {growthParams && (
            <p>The maximum specific growth rate (µmax) was determined to be <strong>{growthParams.muMax} h⁻¹</strong>, with a doubling time of <strong>{growthParams.doublingTime} h</strong>. The log phase was observed between <strong>T+{growthParams.logStart}h and T+{growthParams.logEnd}h</strong>.</p>
          )}
          {measurements.some(m => m.od_value) && (
            <p>Maximum OD recorded: <strong>{Math.max(...measurements.filter(m => m.od_value).map(m => parseFloat(m.od_value))).toFixed(4)}</strong> at T+{measurements.reduce((best, m) => parseFloat(m.od_value || 0) > parseFloat(best.od_value || 0) ? m : best, measurements[0]).actual_hour}h.</p>
          )}
          <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-8">Conducted by</p>
              <div className="border-b border-slate-400 w-48 mb-1"></div>
              <p className="text-xs text-slate-500">Signature &amp; Date</p>
            </div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-8">Reviewed by</p>
              <div className="border-b border-slate-400 w-48 mb-1"></div>
              <p className="text-xs text-slate-500">Signature &amp; Date</p>
            </div>
          </div>
        </div>
      </Section>

      <p className="text-center text-[10px] text-slate-300 print:block">Generated by OxyOS Research Module · {new Date().toISOString()}</p>
    </div>
  );
}
