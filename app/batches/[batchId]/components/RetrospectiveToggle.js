import { Clock, AlertTriangle } from 'lucide-react';

export default function RetrospectiveToggle({
  isRetrospective,
  setIsRetrospective,
  loggedAt,
  setLoggedAt,
  retroReason,
  setRetroReason
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700">Retrospective Logging</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={isRetrospective}
            onChange={(e) => {
              setIsRetrospective(e.target.checked);
              if (!e.target.checked) {
                setLoggedAt('');
                setRetroReason('');
              }
            }}
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-navy"></div>
        </label>
      </div>

      {isRetrospective && (
        <div className="flex flex-col sm:flex-row gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Actual Time of Reading <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={loggedAt}
              onChange={(e) => setLoggedAt(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Reason Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., System offline, Paper transcription..."
              value={retroReason}
              onChange={(e) => setRetroReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </div>
        </div>
      )}
      
      {isRetrospective && (!loggedAt || !retroReason) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5" /> Both fields are required for ALCOA++ compliance.
        </div>
      )}
    </div>
  );
}
