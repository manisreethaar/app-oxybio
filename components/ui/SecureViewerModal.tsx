// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { X, Lock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function SecureViewerModal({ url, title, onClose, allowDownload = false }) {
  const { employeeProfile } = useAuth();
  const [isBlurred, setIsBlurred] = useState(false);
  const containerRef = useRef(null);

  // Blur on window blur to deter screenshots and block keyboard shortcuts
  useEffect(() => {
    const handleBlur = () => setIsBlurred(true);
    const handleFocus = () => setIsBlurred(false);

    const handleKeyDown = (e) => {
      // Block Ctrl+P, Ctrl+S, Ctrl+U, PrintScreen
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return false;
      }
      if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText(''); // try to clear clipboard
        setIsBlurred(true);
        setTimeout(() => setIsBlurred(false), 2000);
      }
    };

    const handleCopy = (e) => {
      e.preventDefault();
      return false;
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
    };
  }, []);

  // Determine file type and URL
  const urlWithoutParams = url?.split('?')[0].split('#')[0];
  const isPdf = urlWithoutParams?.toLowerCase().endsWith('.pdf');
  const isImage = urlWithoutParams?.match(/\.(jpeg|jpg|gif|png|webp)$/i);
  const isOfficeDoc = urlWithoutParams?.match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/i);

  let viewerUrl = url;
  if (isPdf) {
    viewerUrl = `${url}#toolbar=${allowDownload ? '1' : '0'}&navpanes=0&scrollbar=0`;
  } else if (isOfficeDoc) {
    viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  const userEmail = employeeProfile?.email || 'Unauthorized';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4 sm:p-6 select-none print:hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { display: none !important; }
        }
      `}} />
      <div 
        ref={containerRef}
        className={`bg-white rounded-2xl w-full h-full max-w-6xl max-h-[95vh] flex flex-col relative shadow-2xl transition-all duration-200 overflow-hidden border border-slate-200 ${isBlurred ? 'blur-xl grayscale' : ''}`}
        onContextMenu={(e) => e.preventDefault()} // Block right click
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <Lock className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-sm text-slate-900 leading-tight">{title || 'Secure Document Viewer'}</span>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">OXYBIO Protected Mode</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="relative flex-1 bg-slate-50 flex items-center justify-center overflow-hidden">
          
          {/* Dynamic Watermark to deter screenshots */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-around overflow-hidden z-[60] opacity-[0.12] mix-blend-multiply">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={`flex justify-between w-[200%] whitespace-nowrap transform -rotate-[25deg] scale-150 py-12 text-slate-900 font-black text-2xl tracking-[0.2em] uppercase ${i % 2 === 0 ? '-translate-x-1/4' : ''}`}>
                <span>{userEmail} CONFIDENTIAL • OXYBIO</span>
                <span>{userEmail} CONFIDENTIAL • OXYBIO</span>
                <span>{userEmail} CONFIDENTIAL • OXYBIO</span>
              </div>
            ))}
          </div>

          {/* Iframe Overlay to block interacting with the iframe directly (e.g. context menus inside the PDF viewer) */}
          {!allowDownload && <div className="absolute inset-0 z-40 pointer-events-none" />}

          {isBlurred && (
            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-white/90 backdrop-blur-xl">
              <div className="text-center p-8 bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm transform scale-110">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">View Suspended</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">Document view has been suspended to prevent unauthorized capture. Click back here to resume viewing.</p>
              </div>
            </div>
          )}

          {isPdf || isOfficeDoc ? (
            <iframe 
              src={viewerUrl} 
              className="w-full h-full border-0 relative z-30"
              title={title}
            />
          ) : isImage ? (
            <img src={url} alt={title} className="max-w-full max-h-full object-contain p-4 relative z-30" draggable="false" />
          ) : (
            <div className="text-center p-8 relative z-30">
              <p className="text-slate-500 font-medium">Preview not available for this file type.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

