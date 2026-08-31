async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/batches/d7eeb5aa-5cb9-4581-a98e-57238c2471b6/seed-trains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' })
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.log(e);
  }
}
run();
