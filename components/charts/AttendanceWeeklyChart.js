'use client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function AttendanceWeeklyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 600, fill: '#6B7280' }} />
        <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} unit="h" domain={[0, 10]} />
        <Tooltip formatter={(v) => [`${v}h`, 'Hours']} contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
        <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.status === 'Late' ? '#EF4444' : entry.status === 'Early' ? '#3B82F6' : '#1F3A5F'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
