'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts';

export function ResearchTrendChart({ sessions }) {
  const data = [...sessions].reverse().map((s, i) => ({
    name: `S${i + 1}`,
    score: parseFloat(s.avg_score || 0),
    label: s.session_title,
  })).filter(d => !isNaN(d.score));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }} />
        <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#9ca3af' }} unit="/10" />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }} />
        <ReferenceLine y={7} stroke="#0f766e" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#1F3A5F"
          strokeWidth={2.5}
          dot={(props) => (
            <circle
              key={`dot-${props.payload.name}`}
              cx={props.cx}
              cy={props.cy}
              r={5}
              fill={props.payload.score >= 7 ? '#1F3A5F' : '#f87171'}
              stroke="white"
              strokeWidth={2}
            />
          )}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ResearchRadarChart({ session }) {
  const data = (session.test_criteria || ['Taste', 'Aroma', 'Texture', 'Aftertaste', 'Visual']).map(crit => {
    const rawScores = session.scores || [];
    const avgForCrit = rawScores.length > 0
      ? rawScores.reduce((acc, curr) => acc + (curr[crit] || 0), 0) / rawScores.length
      : (session.avg_score || 0);
    return { subject: crit, A: parseFloat(avgForCrit.toFixed(1)) };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
        <Radar name="Score" dataKey="A" stroke="#1F3A5F" fill="#1F3A5F" fillOpacity={0.5} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
