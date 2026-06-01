export async function generateSHA256Hash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function downloadCsvWithHash(csvContent, filename) {
  // Append a blank line and the hash
  const hash = await generateSHA256Hash(csvContent);
  const finalCsv = `${csvContent}nn# Cryptographic Hash (SHA-256): ${hash}`;
  
  const blob = new Blob([finalCsv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
