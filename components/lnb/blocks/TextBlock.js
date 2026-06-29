import React, { useRef, useEffect } from 'react';
import { Type, Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';

function RichToolbar({ execCommand }) {
  const tools = [
    { icon: <Bold className="w-3.5 h-3.5" />, title: 'Bold', cmd: 'bold' },
    { icon: <Italic className="w-3.5 h-3.5" />, title: 'Italic', cmd: 'italic' },
    { icon: <Underline className="w-3.5 h-3.5" />, title: 'Underline', cmd: 'underline' },
    { sep: true },
    { icon: <List className="w-3.5 h-3.5" />, title: 'Bullet List', cmd: 'insertUnorderedList' },
    { icon: <ListOrdered className="w-3.5 h-3.5" />, title: 'Numbered List', cmd: 'insertOrderedList' },
  ];

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-100 flex-wrap">
      {tools.map((t, i) =>
        t.sep ? (
          <div key={i} className="w-px h-4 bg-gray-300 mx-1 shrink-0" />
        ) : (
          <button
            key={i}
            type="button"
            title={t.title}
            onMouseDown={(e) => {
              e.preventDefault();
              execCommand(t.cmd);
            }}
            className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors select-none"
          >
            {t.icon}
          </button>
        )
      )}
    </div>
  );
}

export default function TextBlock({ block, updateBlock, canEdit }) {
  const editorRef = useRef(null);

  useEffect(() => {
    // Only set initial HTML if the editor is empty to avoid cursor jumping
    if (editorRef.current && editorRef.current.innerHTML === '' && block.content) {
      editorRef.current.innerHTML = block.content;
    }
  }, [block.content]);

  const handleInput = () => {
    if (editorRef.current) {
      updateBlock(block.id, { content: editorRef.current.innerHTML });
    }
  };

  const execCommand = (cmd) => {
    document.execCommand(cmd, false, null);
    handleInput();
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Type className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-bold text-gray-500 uppercase">Text Block</span>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {canEdit && <RichToolbar execCommand={execCommand} />}
        <div className="p-1">
          <div
            ref={editorRef}
            contentEditable={canEdit}
            onInput={handleInput}
            onBlur={handleInput}
            className={`w-full p-4 outline-none min-h-[6rem] text-sm text-gray-700 prose prose-sm max-w-none ${!canEdit ? 'bg-transparent' : 'bg-white'}`}
            dangerouslySetInnerHTML={!canEdit ? { __html: block.content || '<span class="text-gray-400 italic text-sm">Empty text block.</span>' } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
