import React, { useRef } from 'react';
import { markdownToHtml } from '@/utils/markdown';
import { Type } from 'lucide-react';

const TOOLBAR_TOOLS = [
  { label: 'B',  title: 'Bold',          cls: 'font-black',  wrap: ['**', '**'] },
  { label: 'I',  title: 'Italic',         cls: 'italic',      wrap: ['*', '*'] },
  { label: '`',  title: 'Inline code',    cls: 'font-mono',   wrap: ['`', '`'] },
  { label: '==', title: 'Highlight',      cls: '',            wrap: ['==', '=='] },
  { sep: true },
  { label: 'H2', title: 'Heading 2',      cls: 'font-bold',   line: '## ' },
  { label: 'H3', title: 'Heading 3',      cls: 'font-bold',   line: '### ' },
  { sep: true },
  { label: '•',  title: 'Bullet list',    cls: '',            line: '- ' },
  { label: '1.', title: 'Numbered list',  cls: '',            line: '1. ' },
  { label: '❝',  title: 'Blockquote',     cls: '',            line: '> ' },
  { sep: true },
  { label: '—',  title: 'Divider',        cls: '',            block: '---' },
];

function RichToolbar({ taRef, value, onChange }) {
  const apply = (tool) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;

    if (tool.wrap) {
      const [before, after] = tool.wrap;
      const sel = value.slice(start, end) || 'text';
      const next = value.slice(0, start) + before + sel + after + value.slice(end);
      onChange(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + sel.length); }, 0);
    } else if (tool.line) {
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      const next = value.slice(0, lineStart) + tool.line + value.slice(lineStart);
      onChange(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(lineStart + tool.line.length, lineStart + tool.line.length); }, 0);
    } else if (tool.block) {
      const nl = start === 0 || value[start - 1] === '\n' ? '' : '\n';
      const next = value.slice(0, start) + nl + tool.block + '\n' + value.slice(end);
      onChange(next);
      setTimeout(() => ta.focus(), 0);
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex-wrap">
      {TOOLBAR_TOOLS.map((t, i) =>
        t.sep ? (
          <div key={i} className="w-px h-3.5 bg-gray-200 mx-1 shrink-0" />
        ) : (
          <button
            key={i}
            type="button"
            title={t.title}
            onMouseDown={(e) => { e.preventDefault(); apply(t); }}
            className={`px-2 py-1 rounded text-[11px] text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors select-none ${t.cls}`}
          >
            {t.label}
          </button>
        )
      )}
      <span className="ml-auto text-[9px] font-bold text-gray-300 uppercase tracking-widest hidden sm:block">Markdown</span>
    </div>
  );
}

export default function TextBlock({ block, updateBlock, canEdit }) {
  const taRef = useRef(null);
  const value = block.content || '';
  const html = value ? markdownToHtml(value) : '';

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Type className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-bold text-gray-500 uppercase">Text Block</span>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {canEdit && (
          <RichToolbar 
            taRef={taRef} 
            value={value} 
            onChange={(val) => updateBlock(block.id, { content: val })} 
          />
        )}
        <div className="p-1">
          {canEdit ? (
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              className="w-full p-4 bg-transparent outline-none resize-y min-h-[8rem] text-sm font-medium text-gray-700 leading-relaxed font-mono"
              placeholder="Write your observations here..."
            />
          ) : (
            <div className="w-full px-5 py-4 overflow-y-auto prose prose-sm max-w-none min-h-[4rem]">
              {html ? (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <span className="text-gray-400 italic text-sm">Empty text block.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
