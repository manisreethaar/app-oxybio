async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/batches/e759e888-6cbc-4483-b608-e6031fbc186a/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_stage: 'media_prep', to_stage: 'sterilisation' })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (err) {
    console.log('Fetch error:', err.message);
  }
}
run();
