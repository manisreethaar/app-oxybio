'use client';
export default function TestPush() {
  const test = async () => {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assigned_to: '7c2800b0-2fdb-401a-b1b6-d22e8789bd69',
        title: 'Test Notification',
        body: 'Push notifications are working.',
        url: '/dashboard'
      })
    });
    const data = await res.json();
    alert(JSON.stringify(data));
  };
  return (
    <div style={{padding:40}}>
      <button onClick={test} style={{padding:'12px 24px',fontSize:16,background:'teal',color:'white',border:'none',borderRadius:8,cursor:'pointer'}}>
        Send Test Push Notification
      </button>
    </div>
  );
}