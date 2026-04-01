'use client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ProductionYieldChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} allowDecimals={false} />
        <Tooltip contentStyle={{ background: '#fff', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '10px' }} />
        <Bar dataKey="Released" fill="#1F3A5F" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Rejected" fill="#DC2626" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
