'use client';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Scatter
} from 'recharts';

const COLORS = {
  od: '#0d9488',    // violet
  ph: '#6366f1',    // indigo
  glucose: '#f59e0b', // amber
  protein: '#ec4899', // pink
  do2: '#3b82f6',   // blue
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-black text-slate-700 mb-2">T + {label}h</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
          <span className="font-bold text-slate-600">{entry.name}:</span>
          <span className="font-black text-slate-800">{entry.value?.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

export default function GrowthCurveChart({ data, wavelength = 600, showLines = ['od', 'ph'], logScale = false }) {
  if (!data?.length) return (
    <div className="h-48 flex items-center justify-center text-slate-400 text-sm font-medium">
      No measurement data yet. Start recording samples.
    </div>
  );

  const chartData = data.map(m => ({
    hour: parseFloat(m.actual_hour),
    od: m.od_value ? (logScale ? Math.log10(parseFloat(m.od_value)) : parseFloat(m.od_value)) : null,
    ph: m.ph_value ? parseFloat(m.ph_value) : null,
    glucose: m.glucose_g_l ? parseFloat(m.glucose_g_l) : null,
    protein: m.protein_mg_ml ? parseFloat(m.protein_mg_ml) : null,
    do2: m.dissolved_oxygen_pct ? parseFloat(m.dissolved_oxygen_pct) : null,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis
          dataKey="hour"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
          label={{ value: 'Hours', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: '#94a3b8' }}
        />
        {/* Left Y-axis: OD and biochemistry */}
        <YAxis
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
          label={{ value: logScale ? `log₁₀ OD${wavelength}` : `OD${wavelength}`, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
          width={55}
        />
        {/* Right Y-axis: pH */}
        <YAxis
          yAxisId="right"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fontWeight: 700, fill: '#6366f1' }}
          domain={[3, 10]}
          label={{ value: 'pH', angle: 90, position: 'insideRight', fontSize: 10, fill: '#6366f1' }}
          width={35}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '8px' }}
          iconType="circle"
          iconSize={8}
        />

        {showLines.includes('od') && (
          <Line yAxisId="left" type="monotone" dataKey="od" name={`OD${wavelength}`}
            stroke={COLORS.od} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.od, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6 }} connectNulls />
        )}
        {showLines.includes('ph') && (
          <Line yAxisId="right" type="monotone" dataKey="ph" name="pH"
            stroke={COLORS.ph} strokeWidth={2} strokeDasharray="5 4"
            dot={{ r: 3, fill: COLORS.ph, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 5 }} connectNulls />
        )}
        {showLines.includes('glucose') && (
          <Line yAxisId="left" type="monotone" dataKey="glucose" name="Glucose (g/L)"
            stroke={COLORS.glucose} strokeWidth={2} strokeDasharray="3 3"
            dot={{ r: 3, fill: COLORS.glucose, strokeWidth: 2, stroke: '#fff' }} connectNulls />
        )}
        {showLines.includes('protein') && (
          <Line yAxisId="left" type="monotone" dataKey="protein" name="Protein (mg/mL)"
            stroke={COLORS.protein} strokeWidth={2} strokeDasharray="8 3"
            dot={{ r: 3, fill: COLORS.protein, strokeWidth: 2, stroke: '#fff' }} connectNulls />
        )}
        {showLines.includes('do2') && (
          <Line yAxisId="left" type="monotone" dataKey="do2" name="DO (%)"
            stroke={COLORS.do2} strokeWidth={2}
            dot={{ r: 3, fill: COLORS.do2, strokeWidth: 2, stroke: '#fff' }} connectNulls />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
