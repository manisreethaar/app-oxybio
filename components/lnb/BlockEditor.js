import React from 'react';
import { Type, Image as ImageIcon, Table as TableIcon, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import TextBlock from './blocks/TextBlock';
import ImageBlock from './blocks/ImageBlock';
import TableChartBlock from './blocks/TableChartBlock';

export default function BlockEditor({ value, onChange, canEdit }) {
  // If value is a string, it's legacy markdown. We should convert it to a block array.
  let blocks = [];
  try {
    blocks = typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : null;
  } catch (e) {
    blocks = null;
  }

  if (!Array.isArray(blocks)) {
    blocks = [{ id: 'b_legacy', type: 'text', content: value || '' }];
  }

  const updateBlocks = (newBlocks) => {
    onChange(JSON.stringify(newBlocks));
  };

  const addBlock = (type) => {
    const newBlock = { id: `b_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, type, content: type === 'table_chart' ? {} : '' };
    updateBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id, newProps) => {
    updateBlocks(blocks.map(b => b.id === id ? { ...b, ...newProps } : b));
  };

  const removeBlock = (id) => {
    updateBlocks(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (index, dir) => {
    if ((dir === -1 && index === 0) || (dir === 1 && index === blocks.length - 1)) return;
    const newBlocks = [...blocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[index + dir];
    newBlocks[index + dir] = temp;
    updateBlocks(newBlocks);
  };

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <div key={block.id} className="relative group/block bg-white p-3 rounded-2xl border border-slate-100 shadow-sm transition-shadow hover:shadow-md">
          {/* Controls */}
          {canEdit && (
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 opacity-0 group-hover/block:opacity-100 transition-opacity z-10 bg-white shadow-sm border border-slate-200 rounded-lg p-1">
              <button onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-navy hover:bg-slate-50 rounded disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => removeBlock(block.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="p-1 text-slate-400 hover:text-navy hover:bg-slate-50 rounded disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Render Block */}
          {block.type === 'text' && <TextBlock block={block} updateBlock={updateBlock} canEdit={canEdit} />}
          {block.type === 'image' && <ImageBlock block={block} updateBlock={updateBlock} canEdit={canEdit} />}
          {block.type === 'table_chart' && <TableChartBlock block={block} updateBlock={updateBlock} canEdit={canEdit} />}
        </div>
      ))}

      {canEdit && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => addBlock('text')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-navy border border-slate-200 transition-colors shadow-sm">
            <Type className="w-4 h-4" /> Add Text
          </button>
          <button onClick={() => addBlock('image')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-navy border border-slate-200 transition-colors shadow-sm">
            <ImageIcon className="w-4 h-4" /> Add Image
          </button>
          <button onClick={() => addBlock('table_chart')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-navy border border-slate-200 transition-colors shadow-sm">
            <TableIcon className="w-4 h-4" /> Add Data Table
          </button>
        </div>
      )}
    </div>
  );
}
