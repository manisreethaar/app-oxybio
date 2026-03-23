const fs = require('fs');

const content = fs.readFileSync('e:\\OXYBIO\\app\\inventory\\InventoryClient.tsx', 'utf-8');
const lines = content.split('\n');

let oP = 0, cP = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '(') oP++;
        if (char === ')') cP++;
    }
}

console.log(`Paren Open: ${oP}, Close: ${cP}`);
if (oP !== cP) {
    console.log(`PAREN MISMATCH! Diff: ${oP - cP}`);
} else {
    console.log("Paren Balanced.");
}
