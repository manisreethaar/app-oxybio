import React from 'react';

export default function OxygenLoader({ text = "Loading...", className = "", size = "default" }) {
  const isSmall = size === "small";
  
  if (isSmall) {
    return (
      <div className={`flex items-center justify-center gap-2 ${className}`}>
        <div className="relative w-5 h-5 flex items-end justify-center">
          <div className="absolute w-1 h-1 bg-cyan-500 rounded-full left-[4px] bottom-[2px]" style={{ animation: 'riseSm 1.2s ease-in infinite' }}></div>
          <div className="absolute w-1.5 h-1.5 bg-blue-500 rounded-full left-[12px] bottom-[0px]" style={{ animation: 'riseSm 1.5s ease-in infinite 0.3s' }}></div>
          <div className="absolute w-[3px] h-[3px] bg-cyan-400 rounded-full left-[8px] bottom-[4px]" style={{ animation: 'riseSm 1s ease-in infinite 0.6s' }}></div>
        </div>
        {text && <span className="text-xs font-bold text-slate-500 animate-pulse">{text}</span>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-8 ${className}`}>
      <div className="relative w-16 h-16 flex items-end justify-center">
        {/* Glowing aura */}
        <div className="absolute w-12 h-12 bg-cyan-400/20 rounded-full blur-xl animate-pulse"></div>
        
        {/* Bubbles */}
        <div className="absolute w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)] left-[20px] bottom-[4px]" style={{ animation: 'riseLg 1.8s ease-in infinite' }}></div>
        <div className="absolute w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] left-[36px] bottom-[8px]" style={{ animation: 'riseLg 1.4s ease-in infinite 0.4s' }}></div>
        <div className="absolute w-4 h-4 bg-cyan-300 rounded-full shadow-[0_0_12px_rgba(103,232,249,0.9)] left-[14px] bottom-[0px]" style={{ animation: 'riseLg 2.2s ease-in infinite 0.8s' }}></div>
        <div className="absolute w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.9)] left-[42px] bottom-[12px]" style={{ animation: 'riseLg 1.5s ease-in infinite 0.2s' }}></div>
        <div className="absolute w-1.5 h-1.5 bg-cyan-200 rounded-full left-[28px] bottom-[2px]" style={{ animation: 'riseLg 1.2s ease-in infinite 1.1s' }}></div>
      </div>
      {text && <span className="text-sm font-black tracking-widest uppercase text-cyan-600/80 animate-pulse">{text}</span>}
    </div>
  );
}
