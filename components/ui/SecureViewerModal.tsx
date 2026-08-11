// @ts-nocheck
import { useState, useEffect } from 'react';
import { X, Lock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function SecureViewerModal({ url, title, onClose }) {
  const { employeeProfile } = useAuth();
  const [isBlurred, setIsBlurred] = useState(false);

  // Blur on window blur to deter screenshots
  useEffect(() => {
    const handleBlur = () => setIsBlurred(true);
    const handleFocus = () => setIsBlurred(false);

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Determine file type and URL
  const urlWithoutParams = url?.split('?')[0].split('#')[0];
  const isPdf = urlWithoutParams?.toLowerCase().endsWith('.pdf');
  const isImage = urlWithoutParams?.match(/\.(jpeg|jpg|gif|png|webp)$/i);
  const isOfficeDoc = urlWithoutParams?.match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/i);

  let viewerUrl = url;
  if (isPdf) {
    viewerUrl = `${url}#toolbar=0&navpanes=0&scrollbar=0`;
  } else if (isOfficeDoc) {
    viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  const userEmail = employeeProfile?.email || 'Unauthorized';

  return (
    <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex justify-center items-center z-[100] p-4 select-none">
      <div 
        className={`bg-white rounded-xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col relative shadow-2xl transition-all duration-200 overflow-hidden ${isBlurred ? 'blur-md grayscale' : ''}`}
        onContextMenu={(e) => e.preventDefault()} // Block right click
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-sm text-slate-800">{title || 'Secure Document Viewer'}</span>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-black uppercase px-2 py-0.5 rounded tracking-widest ml-2">Protected Mode</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="relative flex-1 bg-slate-100 flex items-center justify-center overflow-hidden">
          
          {/* Dynamic Watermark to deter screenshots */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between overflow-hidden z-50 opacity-10">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex justify-between w-full whitespace-nowrap -rotate-12 transform scale-150 py-16 text-slate-900 font-black text-2xl tracking-widest uppercase mix-blend-multiply">
                <span>{userEmail} CONFIDENTIAL</span>
                <span>{userEmail} CONFIDENTIAL</span>
                <span>{userEmail} CONFIDENTIAL</span>
              </div>
            ))}
          </div>

          {/* Iframe Overlay to block interacting with the iframe directly (e.g. context menus inside the PDF viewer) */}
          <div className="absolute inset-0 z-40 pointer-events-none" />

          {isBlurred && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md">
              <div className="text-center p-6 bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                <h3 className="text-lg font-black text-slate-900 mb-1">Window Unfocused</h3>
                <p className="text-sm text-slate-600 font-medium leading-relaxed">Document view has been suspended to prevent unauthorized capture. Click back here to resume viewing.</p>
              </div>
            </div>
          )}

          {isPdf || isOfficeDoc ? (
            <iframe 
              src={viewerUrl} 
              className="w-full h-full border-0"
              title={title}
            />
          ) : isImage ? (
            <img src={url} alt={title} className="max-w-full max-h-full object-contain p-4" draggable="false" />
          ) : (
            <div className="text-center p-8">
              <p className="text-slate-500">Preview not available for this file type.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
