'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ShelfLifeLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="80%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 16px -4px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }} />
        <Line type="monotone" dataKey="ph" name="pH" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 4, fill: '#0f172a', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
        <Line type="monotone" dataKey="brix" name="Brix" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
