'use client';
import React, { useMemo } from 'react';

/**
 * AuditDiffViewer
 * Compares two JSON objects and renders the differences.
 */
export default function AuditDiffViewer({ oldData, newData }) {
  const diffs = useMemo(() => {
    const o = oldData || {};
    const n = newData || {};
    
    // Combine all keys
    const allKeys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)]));
    
    return allKeys.map(key => {
      const oldVal = o[key];
      const newVal = n[key];
      
      const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal ?? '');
      const newStr = typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? '');

      if (oldVal === undefined && newVal !== undefined) {
        return { key, type: 'added', newVal: newStr };
      }
      if (oldVal !== undefined && newVal === undefined) {
        return { key, type: 'removed', oldVal: oldStr };
      }
      if (oldStr !== newStr) {
        return { key, type: 'modified', oldVal: oldStr, newVal: newStr };
      }
      return { key, type: 'unchanged', oldVal: oldStr, newVal: newStr };
    }).filter(d => d.type !== 'unchanged');
  }, [oldData, newData]);

  if (diffs.length === 0) {
    return <div className="text-xs text-slate-400 italic py-2">No visible changes recorded.</div>;
  }

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 my-2 text-xs font-mono overflow-x-auto shadow-inner">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-1 px-2 text-slate-500 font-semibold w-1/4">Field</th>
            <th className="py-1 px-2 text-slate-500 font-semibold w-3/8">Old Value</th>
            <th className="py-1 px-2 text-slate-500 font-semibold w-3/8">New Value</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={diff.key} className="border-b border-slate-100/50 last:border-0">
              <td className="py-1.5 px-2 font-medium text-slate-700 align-top">{diff.key}</td>
              <td className="py-1.5 px-2 align-top">
                {['removed', 'modified'].includes(diff.type) ? (
                  <span className="bg-red-50 text-red-600 px-1 py-0.5 rounded border border-red-100 break-all">
                    {diff.oldVal}
                  </span>
                ) : (
                  <span className="text-slate-300 italic">—</span>
                )}
              </td>
              <td className="py-1.5 px-2 align-top">
                {['added', 'modified'].includes(diff.type) ? (
                  <span className="bg-green-50 text-green-700 px-1 py-0.5 rounded border border-green-100 break-all">
                    {diff.newVal}
                  </span>
                ) : (
                  <span className="text-slate-300 italic">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
