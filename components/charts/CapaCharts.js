'use client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

export function CapaSeverityChart({ deviations }) {
  const data = [
    { name: 'Minor', count: deviations.filter(d => d.severity === 'Minor').length, fill: '#3b82f6' },
    { name: 'Major', count: deviations.filter(d => d.severity === 'Major').length, fill: '#f59e0b' },
    { name: 'Critical', count: deviations.filter(d => d.severity === 'Critical').length, fill: '#ef4444' },
  ];
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((e, i) => <Cell key={i} fill={e.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CapaStatusChart({ pieData }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <PieChart>
        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" nameKey="name">
          {pieData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
