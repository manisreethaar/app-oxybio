export function markdownToHtml(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;

  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-800">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/==(.+?)==/g, '<mark class="bg-yellow-100 text-yellow-800 px-0.5 rounded">$1</mark>')
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-gray-100 text-blue-700 px-1.5 py-0.5 rounded text-[13px] font-mono">$1</code>'
      )
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-blue-600 underline underline-offset-2 hover:text-blue-800">$1</a>'
      );

  const toId = (t) =>
    t.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // HR
    if (line.trim() === '---') {
      result.push('<hr class="my-8 border-gray-200 print:my-4" />');
      i++; continue;
    }

    // Headings
    const hm = line.match(/^(#{1,4}) (.+)$/);
    if (hm) {
      const lvl = hm[1].length;
      const txt = hm[2];
      const id = toId(txt);
      const cls = {
        1: 'text-2xl font-black text-gray-900 mt-2 mb-4 scroll-mt-24 print:text-xl',
        2: 'text-xl font-bold text-gray-800 mt-10 mb-3 pb-2 border-b-2 border-blue-100 scroll-mt-24 print:mt-6 print:text-lg',
        3: 'text-base font-bold text-navy mt-6 mb-2 scroll-mt-24',
        4: 'text-sm font-bold text-gray-600 mt-4 mb-1 uppercase tracking-wide',
      }[lvl] || 'font-bold mt-4 mb-2';
      result.push(`<h${lvl} id="${id}" class="${cls}">${inline(txt)}</h${lvl}>`);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(
        `<blockquote class="border-l-4 border-blue-300 pl-4 py-1 my-4 bg-blue-50/70 rounded-r-xl text-gray-600 text-sm italic print:bg-transparent">${inline(line.slice(2))}</blockquote>`
      );
      i++; continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(esc(lines[i]));
        i++;
      }
      result.push(
        `<pre class="bg-gray-900 text-green-400 rounded-xl p-4 my-4 overflow-x-auto text-sm font-mono leading-relaxed print:text-xs print:bg-gray-100 print:text-gray-800"><code>${codeLines.join('\n')}</code></pre>`
      );
      i++; continue;
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter((l) => !l.match(/^\|[\s:|-]+\|$/));
      if (rows.length > 0) {
        const parseRow = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
        const [header, ...body] = rows;
        const hCells = parseRow(header)
          .map(
            (c) =>
              `<th class="px-4 py-2.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">${inline(c)}</th>`
          )
          .join('');
        const bRows = body
          .map(
            (r, ri) =>
              `<tr class="${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}">${parseRow(r)
                .map(
                  (c) =>
                    `<td class="px-4 py-2.5 text-gray-600 text-sm align-top">${inline(c)}</td>`
                )
                .join('')}</tr>`
          )
          .join('');
        result.push(
          `<div class="overflow-x-auto my-4 rounded-xl border border-gray-200 shadow-sm print:shadow-none"><table class="w-full border-collapse text-sm"><thead class="bg-gray-50 border-b border-gray-200"><tr>${hCells}</tr></thead><tbody class="divide-y divide-gray-100">${bRows}</tbody></table></div>`
        );
      }
      continue;
    }

    // Unordered list — collect consecutive items
    if (line.match(/^- /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^- /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      result.push(
        `<ul class="space-y-1.5 my-3">${items
          .map(
            (it) =>
              `<li class="flex items-start gap-2 text-gray-600 text-sm"><span class="text-blue-400 mt-[3px] shrink-0 font-bold">•</span><span>${inline(it)}</span></li>`
          )
          .join('')}</ul>`
      );
      continue;
    }

    // Numbered list — collect consecutive items
    if (line.match(/^\d+\. /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      result.push(
        `<ol class="space-y-1.5 my-3">${items
          .map(
            (it, idx) =>
              `<li class="flex items-start gap-3 text-gray-600 text-sm"><span class="text-blue-500 font-bold shrink-0 w-4 text-right">${idx + 1}.</span><span>${inline(it)}</span></li>`
          )
          .join('')}</ol>`
      );
      continue;
    }

    // Paragraph
    result.push(
      `<p class="text-gray-600 leading-relaxed my-2 text-sm">${inline(line)}</p>`
    );
    i++;
  }

  return result.join('\n');
}
