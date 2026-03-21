'use client';

export default function GlobalError({ error, reset }) {
  // Global error catches errors in RootLayout.
  // We provide a bare-bones HTML page that forces a hard cache obliteration.
  
  const forceRescue = () => {
    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
         navigator.serviceWorker.getRegistrations().then(function(registrations) {
           for(let registration of registrations) {
             registration.update();
           }
         });
      }
      caches.keys().then((names) => {
        for (let name of names) caches.delete(name);
      });
      window.location.href = '/login';
    }
  };

  return (
    <html lang="en">
      <body style={{ backgroundColor: '#f8fafc', margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ maxWidth: '400px', width: '100%', backgroundColor: 'white', borderRadius: '1.5rem', padding: '2rem', textAlign: 'center', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#1e293b', margin: '0 0 0.5rem 0' }}>Fatal System Error</h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              The application encountered a critical root-level error. This is usually caused by an outdated browser cache.
            </p>
            <button 
              onClick={forceRescue}
              style={{ width: '100%', padding: '1rem', backgroundColor: '#115e59', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '0.75rem', cursor: 'pointer' }}
            >
              Clear Cache & Restore System
            </button>
            <p style={{ marginTop: '1.5rem', fontSize: '10px', color: '#94a3b8', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              ERR_CODE: {error?.message || "Root_Layout_Crash"}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
