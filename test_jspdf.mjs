async function test() {
  const jspdf = await import('jspdf');
  console.log('Keys:', Object.keys(jspdf));
}
test();
