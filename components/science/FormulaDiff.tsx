'use client';
import { Minus, Plus, Equal } from 'lucide-react';

export default function FormulaDiff({ v1, v2 }) {
  if (!v1 || !v2) return null;

  const getIngredientsMap = (text) => {
    const map = {};
    const lines = text.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      // Basic regex to find numbers and names (e.g., "Manganese 5g" or "5.2kg Sugar")
      const matches = line.match(/([\d.]+)\s*(\w+)?\s*(.+)/) || line.match(/(.+)\s*([\d.]+)\s*(\w+)?/);
      if (matches) {
        const name = (matches[3] || matches[1]).trim().toLowerCase();
        const value = parseFloat(matches[1] || matches[2]);
        const unit = (matches[2] || matches[3] || '').trim();
        map[name] = { value, unit, original: line };
      } else {
        map[line.toLowerCase()] = { value: null, unit: '', original: line };
      }
    });
    return map;
  };

  const map1 = getIngredientsMap(v1.ingredients || '');
  const map2 = getIngredientsMap(v2.ingredients || '');
  const allKeys = Array.from(new Set([...Object.keys(map1), ...Object.keys(map2)]));

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Visual Delta: V{v1.version} → V{v2.version}</span>
      </div>
      <div className="p-4 space-y-2">
        {allKeys.map(key => {
          const item1 = map1[key];
          const item2 = map2[key];

          if (!item1) {
            return (
              <div key={key} className="flex items-center gap-3 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800 text-xs font-bold">
                <Plus className="w-3 h-3"/> [NEW] {item2.original}
              </div>
            );
          }
          if (!item2) {
            return (
              <div key={key} className="flex items-center gap-3 p-2 bg-red-50 border border-red-100 rounded-lg text-red-800 text-xs font-bold opacity-60">
                <Minus className="w-3 h-3"/> [REMOVED] {item1.original}
              </div>
            );
          }
          
          const diff = item2.value - item1.value;
          if (diff === 0 || (isNaN(item1.value) && isNaN(item2.value))) {
             return (
              <div key={key} className="flex items-center gap-3 p-2 bg-gray-50 border border-transparent rounded-lg text-gray-400 text-xs font-medium">
                <Equal className="w-3 h-3"/> {item2.original}
              </div>
            );
          }

          return (
            <div key={key} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold">
              <span className="text-blue-900">{key.toUpperCase()}</span>
              <span className={diff > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                {item1.value}{item1.unit} → {item2.value}{item2.unit} ({diff > 0 ? '+' : ''}{diff.toFixed(2)}{item2.unit})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
