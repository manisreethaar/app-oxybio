import { readFileSync } from 'fs';
import { join } from 'path';
import { BookOpen } from 'lucide-react';
import { markdownToHtml } from '@/utils/markdown';
import PrintButton from './PrintButton';

export const metadata = {
  title: 'Help & User Manual — OxyOS',
};

export default function HelpPage() {
  const manualPath = join(process.cwd(), 'USER_MANUAL.md');
  const raw = readFileSync(manualPath, 'utf-8');
  const html = markdownToHtml(raw);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 print:max-w-none print:pb-0">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Help &amp; User Manual</h1>
          </div>
          <p className="text-gray-500 text-sm ml-12">
            Everything you need to know about using OxyOS. Updates automatically when the app changes.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Print header (only shows when printing) */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-black text-gray-900">OxyOS — User Manual</h1>
        <p className="text-gray-500 text-sm mt-1">Oxygen Bioinnovations · Internal Use Only</p>
      </div>

      {/* Manual content */}
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 print:shadow-none print:border-none print:p-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 2cm; }
          body { font-size: 11pt; }
          nav, aside, header, footer { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
