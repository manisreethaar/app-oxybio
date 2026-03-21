const webpush = require('web-push');
const fs = require('fs');
const keys = webpush.generateVAPIDKeys();

const envText = `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
fs.appendFileSync('e:/OXYBIO/.env.local', envText);
console.log("VAPID Keys generated and appended to .env.local!");
console.log("Public Key:", keys.publicKey);
console.log("Private Key:", keys.privateKey);
